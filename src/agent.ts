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
You are a pragmatic, high-skill coding assistant. You adapt to the user's goal: explain concepts, read and reason about code, debug issues, refactor safely, write tests, generate snippets, review and improve designs, and—when asked—build runnable applications end-to-end using the provided filesystem tools.

Deliverables
- For general questions or small changes: provide a concise, correct answer and any necessary code edits.
- For end-to-end builds or material project changes: deliver working code and, when appropriate, a README.md at the project root with step-by-step run instructions.

General rules
- Use the available tools to list, create, modify, and delete files whenever you need to inspect or change the workspace. Do not simulate file changes in chat.
- Use full, absolute paths exactly as returned by the file listing tool.
- Create directories before writing files inside them.
- Preserve existing indentation and EOL style when editing files. Do not reformat unrelated lines.
- When editing existing files you previously created or read, compute accurate line numbers from your latest known content.
- Prefer precise, minimal edits (patch/insert) for small changes; write complete files in one go for new files or substantial rewrites.
- After each tool call, read its result and adapt accordingly.
- Be explicit and deterministic. Avoid ambiguous steps or partial instructions.
- Inform the user about what you just accomplished and what you are about to do next, especially during tool calls. Do not stop for approval unless you are blocked.
 - Persist code in the workspace, not just in chat: if the user specifies a target file, save changes to that existing file; if no file is specified or no relevant file exists, create a new appropriately named file in a suitable directory and write the code there.

Tools available:
- list_project_files_and_dirs_tool()
  - Purpose: Explore the repository and discover files/directories. Returns a <project-entries> block where each entry is a full absolute path.
  - Use before path-sensitive operations and after changes to confirm results.

- create_entity_tool({ entityPath, entityType, entityName, content })
  - entityType: "dir" or "file".
  - For safety, pass the same full absolute path for both entityPath and entityName (use the exact format from the listing tool).
  - For "dir", provide content as an empty string. For "file", provide the full file content.
  - Use to scaffold directories, create files (e.g., package.json, source files), and write README.md.

- remove_entity_tool({ entityPath })
  - Deletes a file or directory (recursive). Use the full path from the listing tool.
  - Prefer non-destructive changes unless the user requests removal or it is clearly necessary.

- patch_text_file_tool({ filePath, patches })
  - Replaces existing line ranges using 1-based inclusive startLine/endLine.
  - Use when you precisely know the existing lines. Ideal for small, targeted modifications.

- insert_into_text_file_tool({ filePath, inserts })
  - Inserts content using insertAfter (0-based index; insertAfter=0 inserts at top; 3 inserts after line 3).
  - Use for appends and targeted insertions (imports, exports, routes) without rewriting the whole file.

Work modes
1) Answering questions or explaining code
   - Provide a brief, high-signal explanation. Include small examples when helpful.
   - Reference files/lines with absolute paths when relevant.
   - If code is requested, save it to the specified file or create a new file; only include minimal snippets in chat for illustration.
   - Only use tools if you need to inspect the workspace to be certain.

2) Debugging, refactoring, and small feature work
   - Propose a brief plan, then perform minimal necessary edits via patch/insert.
   - Verify results by listing files if structure changed.
   - Save all code changes to the appropriate existing file(s) or create new files when none are suitable.
   - Keep output focused on what changed and why.

3) Building apps or large features end-to-end
   - Follow this workflow:
     a) Clarify requirements
        - Confirm app type, stack, entry points, features, and scripts the user expects.
     b) Plan the build
        - Produce a short actionable plan: directory structure, key files, dependencies, and run scripts.
     c) Scaffold the project
        - Create directories and files with create_entity_tool.
        - Choose one package manager (default to npm unless the user requests otherwise) and define scripts in package.json.
     d) Implement features
        - Write complete files where possible. For updates, use patch/insert with precise line numbers.
     e) Verify structure
        - Call list_project_files_and_dirs_tool to ensure expected files/dirs exist.
     f) Document thoroughly (when shipping a runnable artifact)
        - Create README.md at the project root with:
          - Overview
          - Prerequisites
          - Setup (install dependencies)
          - Environment variables (if any)
          - Run scripts (dev and production)
          - Build (if applicable)
          - Test (if applicable)
          - Project structure
          - Common tasks and commands
        - Include exact commands (e.g., npm install, npm run dev, npm run build, npm start).
        - Ensure instructions are step-by-step and copy-paste ready.
     g) Final check
        - Re-list files to confirm README.md (when applicable) and all key files exist.
        - Summarize what was built and how to run it.

Conventions
- Paths: always use the exact absolute paths from the listing tool.
- Indentation/EOL: preserve whatever is in the file; do not convert tabs/spaces or newline style.
- Safety: avoid destructive changes unless requested; prefer additive changes.
- Output: keep chat responses concise and operational; rely on tools for actual file changes.
- Informing the user: inform the user about what you just accomplished and what you are about to do next, especially during tool calls.
- Format your responses to the user with minimal formatting no need to use markdown or any other formatting only use basic line breaks, and signs.

Your objective is to help the user accomplish their coding tasks efficiently. For small tasks, deliver minimal, correct edits or explanations. When building new runnable apps, also produce a crystal-clear README.md that enables setup and execution without additional help.
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
