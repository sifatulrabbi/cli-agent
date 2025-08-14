import { ChatOpenAI, ChatOpenAIResponses } from "@langchain/openai";
import {
  SystemMessage,
  BaseMessage,
  ToolMessage,
  AIMessage,
  AIMessageChunk,
} from "@langchain/core/messages";
import { StateGraph, START, MessagesAnnotation } from "@langchain/langgraph";
import { toolsCondition } from "@langchain/langgraph/prebuilt";
import { DynamicStructuredTool } from "langchain/tools";
import { db, loadMessages, saveMessages } from "@/db";
import { tryCatch } from "@/utils";
import { concat } from "@langchain/core/utils/stream";
import { logger } from "@/logger";

export type DebuggerAgentOptions = {
  historyPath: string;
  systemInstruction?: string;
  trimReasoning?: boolean;
};

export const models = {
  gpt41mini: new ChatOpenAI({
    model: "gpt-4.1-mini",
    useResponsesApi: true,
    streamUsage: true,
  }),
  gpt41: new ChatOpenAI({
    model: "gpt-4.1",
    useResponsesApi: true,
    streamUsage: true,
  }),
  gptOss120b: new ChatOpenAI({
    model: "gpt-oss-120b",
    modelKwargs: {
      reasoning_effort: "high",
    },
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
    },
    streamUsage: true,
  }),
  gptOss20bLocal: new ChatOpenAI({
    model: "openai/gpt-oss-20b",
    modelKwargs: {
      reasoning_effort: "high",
    },
    configuration: {
      baseURL: "http://127.0.0.1:8089/v1",
    },
    streamUsage: true,
  }),
  codexMini: new ChatOpenAI({
    model: "codex-mini",
    useResponsesApi: true,
    streamUsage: true,
  }),
  o4MiniHigh: new ChatOpenAI({
    model: "o4-mini",
    reasoning: {
      effort: "high",
      summary: "auto",
    },
    useResponsesApi: true,
    streamUsage: true,
  }),
  gpt5: new ChatOpenAI({
    model: "gpt-5",
    reasoning: {
      effort: "minimal",
      summary: "auto",
    },
    useResponsesApi: true,
    streamUsage: true,
  }),
  gpt5High: new ChatOpenAI({
    model: "gpt-5",
    reasoning: {
      effort: "high",
      summary: "auto",
    },
    useResponsesApi: true,
    streamUsage: true,
  }),
  gpt5MiniHigh: new ChatOpenAI({
    model: "gpt-5-mini",
    reasoning: {
      effort: "high",
      summary: "auto",
    },
    useResponsesApi: true,
    streamUsage: true,
  }),
  gptOss20bHigh: new ChatOpenAI({
    model: "openai/gpt-oss-20b",
    modelKwargs: {
      reasoning_effort: "high",
    },
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
    },
    streamUsage: true,
  }),
  zAiGlm45: new ChatOpenAI({
    model: "z-ai/glm-4.5v",
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
    },
    streamUsage: true,
  }),
};

export type ModelName = keyof typeof models;

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
  renderUpdates: (messages: BaseMessage[], status?: string) => void,
) {
  return async function (state: typeof MessagesAnnotation.State) {
    renderUpdates(state.messages, "Thinking");

    const messages = [
      sysMsg,
      ...state.messages.map((msg) => {
        if (msg.getType() === "ai") {
          const aiMsg = msg as AIMessage;
          if (aiMsg.additional_kwargs?.reasoning) {
            delete aiMsg.additional_kwargs.reasoning;
          }
        }
        return msg;
      }),
    ];

    try {
      const stream = await llm.bindTools(tools).stream(messages, {
        stream_options: { include_usage: true },
      });
      let finalResponse: AIMessage | undefined = undefined;
      let response: AIMessageChunk | undefined = undefined;
      for await (const chunk of stream) {
        response = response !== undefined ? concat(response, chunk) : chunk;
        if (response && response.content) {
          finalResponse = new AIMessage({
            content: response.content,
            tool_calls: response.tool_calls || [],
            id: response.id,
            response_metadata: response.response_metadata,
            usage_metadata: response.usage_metadata,
            invalid_tool_calls: response.invalid_tool_calls,
            additional_kwargs: response.additional_kwargs,
          });
          renderUpdates([...state.messages, finalResponse], "Thinking");
        }
      }

      if (!response) throw new Error("No response from model");
      response.tool_calls = response.tool_calls?.map((tc) => ({
        ...tc,
        args: tc.args
          ? typeof tc.args === "string"
            ? JSON.parse(tc.args)
            : tc.args
          : {},
      }));
      finalResponse = new AIMessage({
        content: response.content ?? "",
        tool_calls: response.tool_calls || [],
        id: response.id,
        response_metadata: response.response_metadata,
        usage_metadata: response.usage_metadata,
        invalid_tool_calls: response.invalid_tool_calls,
        additional_kwargs: response.additional_kwargs,
      });

      renderUpdates([...state.messages, finalResponse], "Thinking");

      return { messages: [finalResponse] };
    } catch (error) {
      logger.error(error);
      return {
        messages: [new AIMessage({ content: "Error: " + String(error) })],
      };
    }
  };
}

function customToolNode(
  tools: DynamicStructuredTool[],
  renderUpdates: (messages: BaseMessage[], status?: string) => void,
) {
  return async function (state: typeof MessagesAnnotation.State) {
    const aiMsg = state.messages.at(-1) as AIMessage;
    const toolMessages: ToolMessage[] = [];
    for (const toolCall of aiMsg.tool_calls ?? []) {
      const tool = tools.find((t) => t.name === toolCall.name);
      if (tool) {
        renderUpdates(
          [...state.messages, ...toolMessages],
          `Executing ${tool.name}`,
        );

        const { data: result, error } = await tryCatch(
          tool.invoke(toolCall.args),
        );
        const msg = new ToolMessage({
          content: result,
          tool_call_id: toolCall.id ?? "",
          name: tool.name,
          status: error ? "error" : "success",
          additional_kwargs: {
            tool_call_id: toolCall.id ?? "",
            tool_name: tool.name,
            args: toolCall.args,
            error: error ? String(error) : undefined,
          },
        });
        console.error(error);
        toolMessages.push(msg);
      } else {
        const notFoundToolMsg = new ToolMessage({
          content: `Tool '${toolCall.name}' not found`,
          tool_call_id: toolCall.id ?? "",
          name: toolCall.name,
          status: "error",
        });
        toolMessages.push(notFoundToolMsg);
        renderUpdates(
          [...state.messages, ...toolMessages],
          `Not found '${toolCall.name}'`,
        );
      }
    }

    renderUpdates(
      [...state.messages, ...toolMessages],
      "Analyzing tool results",
    );
    return { messages: [...toolMessages] };
  };
}

export async function invokeAgent(
  llm: keyof typeof models,
  tools: DynamicStructuredTool[],
  options: DebuggerAgentOptions,
  renderUpdate: (messages: BaseMessage[], status?: string | null) => void,
) {
  const history = await loadMessages(db, options.historyPath);
  renderUpdate(history, "Thinking");

  const system = new SystemMessage({
    content: (options.systemInstruction ?? defaultSystemInstruction()).trim(),
  });

  const graph = new StateGraph(MessagesAnnotation)
    .addNode("llm", callModelFactory(models[llm], system, tools, renderUpdate))
    .addNode("tools", customToolNode(tools, renderUpdate))
    .addConditionalEdges(START, async (state) => {
      if (state.messages.at(-1)?.getType() === "ai") {
        const lastMsg = state.messages.at(-1) as AIMessage;
        if (lastMsg.tool_calls && lastMsg.tool_calls.length > 0) {
          return "tools";
        }
      }
      return "llm";
    })
    .addConditionalEdges("llm", async (state) => {
      renderUpdate(state.messages, "Thinking");
      await saveMessages(db, options.historyPath, state.messages);
      return toolsCondition(state);
    })
    .addConditionalEdges("tools", async (state) => {
      renderUpdate(state.messages, "Using tools");
      await saveMessages(db, options.historyPath, state.messages);
      return "llm";
    })
    .compile();

  const result = await graph.invoke(
    { messages: history },
    {
      recursionLimit: 10 ** 10,
      configurable: { thread_id: options.historyPath },
    },
  );

  await saveMessages(db, options.historyPath, result.messages);
  renderUpdate(result.messages, "Finalizing");
  return result;
}
