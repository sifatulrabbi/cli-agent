import type { ChatOpenAI, ChatOpenAIResponses } from "@langchain/openai";
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
import { models } from "@/agent/models";
import { defaultSystemInstruction } from "@/agent/prompts";
import type { ModelName } from "@/agent/models";

export type DebuggerAgentOptions = {
  historyPath: string;
  systemInstruction?: string;
  trimReasoning?: boolean;
};

function callModelFactory(
  llm: ChatOpenAI | ChatOpenAIResponses,
  tools: DynamicStructuredTool[],
  renderUpdates: (messages: BaseMessage[], status?: string) => void,
) {
  return async function (state: typeof MessagesAnnotation.State) {
    const system = new SystemMessage({
      content: defaultSystemInstruction().trim(),
    });
    const messages = [
      system,
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
      let finalResponse: AIMessage | undefined = undefined;
      let response: AIMessageChunk | undefined = undefined;
      let lastRender = Date.now();

      renderUpdates(
        [
          ...state.messages,
          new AIMessage({ content: "Processing your request..." }),
        ],
        "Thinking",
      );

      const stream = await llm.bindTools(tools).stream(messages, {
        stream_options: { include_usage: true },
      });

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

          const now = Date.now();
          if (now - lastRender >= 200) {
            renderUpdates([...state.messages, finalResponse], "Thinking");
            lastRender = now;
          }
        } else if (response && response.tool_call_chunks) {
          renderUpdates(
            [
              ...state.messages,
              new AIMessage({
                content: "I will make use of the available tools.",
              }),
            ],
            "Making tool calls",
          );
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
  llm: ModelName,
  tools: DynamicStructuredTool[],
  options: DebuggerAgentOptions,
  renderUpdate: (messages: BaseMessage[], status?: string | null) => void,
) {
  const history = await loadMessages(db, options.historyPath);

  // INFO: for test only
  if (
    history.at(-1)?.getType() === "human" &&
    history.at(-1)!.content === "/test"
  ) {
    renderUpdate(
      [...history, new AIMessage({ content: "Processing your request..." })],
      "Thinking",
    );
    await new Promise((r) => setTimeout(r, 2000));
    renderUpdate(
      [...history, new AIMessage({ content: "Test case update, hello?" })],
      "Thinking",
    );
    await new Promise((r) => setTimeout(r, 2000));
    renderUpdate(
      [...history, new AIMessage({ content: "Test case update 2!" })],
      "Thinking",
    );
    await new Promise((r) => setTimeout(r, 2000));
    renderUpdate(
      [...history, new AIMessage({ content: "Test case update 3. Done!" })],
      "Thinking",
    );
    return;
  }

  const graph = new StateGraph(MessagesAnnotation)
    .addNode("llm", callModelFactory(models[llm], tools, renderUpdate))
    .addNode("tools", customToolNode(tools, renderUpdate))
    // workflow
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
