import { ChatOpenAI, ChatOpenAIResponses } from "@langchain/openai";
import {
  SystemMessage,
  HumanMessage,
  BaseMessage,
  ToolMessage,
  AIMessage,
} from "@langchain/core/messages";
import { StateGraph, START, MessagesAnnotation } from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { DynamicStructuredTool } from "langchain/tools";
import fs from "fs";

export type DebuggerAgentOptions = {
  historyPath: string;
  systemInstruction?: string;
  trimReasoning?: boolean;
};

const gpt41mini = new ChatOpenAI({
  model: "gpt-4.1-mini",
  useResponsesApi: true,
});

const gpt41 = new ChatOpenAI({
  model: "gpt-4.1",
  useResponsesApi: true,
});

const gptOss120b = new ChatOpenAI({
  model: "gpt-oss-120b",
  modelKwargs: {
    reasoning_effort: "high",
  },
  apiKey: process.env.OPENROUTER_API_KEY,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});

export const models = {
  gpt41mini,
  gpt41,
  gptOss120b,
};

function defaultSystemInstruction(): string {
  return `
You are an agentic coding assistant operating within this project. Be precise, safe, and helpful.

You can:
- Receive user prompts, project context, and files.
- Use the available tools to read, create, modify, and remove files. Terminal command execution is not available.

Keep going until the user's query is fully resolved before ending your turn. If you are unsure about file contents or codebase structure, use the tools to read files instead of guessing.

When modifying code, make focused, minimal edits that address the root cause, avoid unnecessary complexity, and keep changes consistent with the existing style. Do not include large file dumps in responses unless explicitly requested.

AVAILABLE TOOLS (use only these and follow their contracts exactly):
- list_project_files_and_dirs_tool: List all files and directories in the active project. Returns entries wrapped in <project-entries> and prefixed by the active project directory name. Use this to discover full paths before operating on files.
- read_files_tool: Read multiple text files.
- create_entity_tool: Create a directory or file.
- remove_entity_tool: Delete a file or directory recursively.
- insert_into_text_file_tool: Insert content into a text file at specific positions while preserving original EOL style.
- patch_text_file_tool: Replace existing line ranges only (no pure insertions).

NOTES ON PATHS AND EDITING:
- Always provide full paths relative to the active project root. If unsure, first call list_project_files_and_dirs_tool and then pass one of its returned entries.
- For textual edits, prefer patch_text_file_tool for replacements and insert_into_text_file_tool for insertions. Do not attempt insertions with the patch tool.
- When responding to the user do not apply any formatting (e.g. markdown, code blocks, etc.). Only use plain text and line breaks.
`.trim();
}

function callModelFactory(
  llm: ChatOpenAI | ChatOpenAIResponses,
  sysMsg: SystemMessage,
  tools: DynamicStructuredTool[],
) {
  return async function (state: typeof MessagesAnnotation.State) {
    const messages = [sysMsg, ...state.messages];
    const response = await llm.bindTools(tools).invoke(
      messages.map((msg) => {
        if (msg.getType() === "ai") {
          const aiMsg = msg as AIMessage;
          if (aiMsg.additional_kwargs?.reasoning) {
            delete aiMsg.additional_kwargs.reasoning;
          }
        }
        return msg;
      }),
    );
    return { messages: [response] };
  };
}

function syncHistory(historyPath: string, messages: BaseMessage[]) {
  fs.writeFileSync(
    historyPath,
    JSON.stringify(
      messages.map((msg) => msg.toJSON()),
      null,
      2,
    ),
  );
}

export function loadHistory(historyPath: string): BaseMessage[] {
  let history: BaseMessage[] = [];
  if (fs.existsSync(historyPath)) {
    try {
      const raw = fs.readFileSync(historyPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        history = parsed.map((entry: any) => {
          const typeId: string | undefined = entry?.id?.[2];
          const kwargs = entry?.kwargs ?? {};
          switch (typeId) {
            case "HumanMessage":
              return new HumanMessage(kwargs);
            case "AIMessage":
              return new AIMessage(kwargs);
            case "ToolMessage":
              return new ToolMessage(kwargs);
            case "SystemMessage":
              return new SystemMessage(kwargs);
            default:
              throw new Error(
                `Unsupported message type in history: ${String(typeId)}`,
              );
          }
        });
      }
    } catch {
      history = [];
    }
  }
  return history;
}

export async function invokeDebuggerAgent(
  llm: ChatOpenAI | ChatOpenAIResponses,
  tools: DynamicStructuredTool[],
  options: DebuggerAgentOptions,
  updateHistory: (messages: BaseMessage[], status?: string) => void,
) {
  const system = new SystemMessage({
    content: (options.systemInstruction ?? defaultSystemInstruction()).trim(),
  });
  const toolNode = new ToolNode(tools);
  const history: BaseMessage[] = loadHistory(options.historyPath);

  updateHistory(history, "thinking...");
  syncHistory(options.historyPath, history);

  const graph = new StateGraph(MessagesAnnotation)
    .addNode("llm", callModelFactory(llm, system, tools))
    .addNode("tools", toolNode)
    .addConditionalEdges(START, (state) => {
      if (state.messages.at(-1)?.getType() === "ai") {
        const lastMsg = state.messages.at(-1) as AIMessage;
        if (lastMsg.tool_calls && lastMsg.tool_calls.length > 0) {
          return "tools";
        }
      }
      updateHistory(state.messages, "thinking...");
      syncHistory(options.historyPath, state.messages);
      return "llm";
    })
    .addConditionalEdges("llm", (state) => {
      syncHistory(options.historyPath, state.messages);
      updateHistory(state.messages);
      const nextNode = toolsCondition(state);
      if (nextNode === "tools") {
        updateHistory(state.messages, "performing tool call(s)...");
        syncHistory(options.historyPath, state.messages);
      }
      return nextNode;
    })
    .addEdge("tools", "llm")
    .compile();

  const result = await graph.invoke(
    { messages: history },
    { recursionLimit: 10 ** 10 },
  );

  syncHistory(options.historyPath, result.messages);
  updateHistory(result.messages);

  return result;
}

export function addMsgToHistory(historyPath: string, msg: BaseMessage) {
  const history = loadHistory(historyPath);
  history.push(msg);
  syncHistory(historyPath, history);
}

export const clearHistory = (historyPath: string) => {
  fs.writeFileSync(historyPath, "[]");
};
