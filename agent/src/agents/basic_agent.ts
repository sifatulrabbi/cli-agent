import {
  START,
  END,
  Annotation,
  MessagesAnnotation,
  StateGraph,
} from "@langchain/langgraph";
import { tool, type DynamicStructuredTool } from "@langchain/core/tools";
import {
  type AIMessage,
  AIMessageChunk,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { Tools } from "../tools/";
import { ChatOpenAIResponses } from "@langchain/openai";
import { basicCodingAgentPrompt } from "../prompts/basic_coding_agent_prompt";
import { getOpenRouterConfig } from "../configs";
import z from "zod";

const BasicAgentStateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  handover: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
  actions: Annotation<Record<string, any>[]>({
    reducer: (x, y) => {
      if (!x || !x.length) {
        return y ?? [];
      }

      const newList = x ?? [];

      y.forEach((newValue) => {
        const idx = x.findIndex(
          (existingValue) => existingValue.index === newValue.index,
        );
        if (idx > -1) {
          newList[idx] = newValue;
        } else {
          newList.push(newValue);
        }
      });

      return newList;
    },
    default: () => [],
  }),
});

export type BasicAgentState = typeof BasicAgentStateAnnotation.State;

const handoverTool = tool(() => "Done", {
  name: "handover",
  description:
    "Use this tool to handover the request to the complex task handling agent.",
  schema: z.object({ handover: z.boolean() }),
});

const availableTools: Record<string, DynamicStructuredTool> = {
  [Tools.bashTool.name]: Tools.bashTool,
  [handoverTool.name]: handoverTool,
};

async function llmNode(
  state: BasicAgentState,
): Promise<Partial<BasicAgentState>> {
  const providerCfg = getOpenRouterConfig();
  const llm = new ChatOpenAIResponses({
    apiKey: providerCfg.API_KEY,
    model: "x-ai/grok-code-fast-1",
    configuration: {
      baseURL: providerCfg.BASE_URL,
    },
  }).bindTools(Object.values(availableTools));
  const result = await llm.invoke([
    new SystemMessage(basicCodingAgentPrompt),
    ...state.messages,
  ]);

  return {
    messages: [result],
    actions: [
      {
        index: state.actions.length,
        title: "Invoking the LLM",
        displayContent: result.text,
      },
    ],
  };
}

async function toolsNode(
  state: BasicAgentState,
): Promise<Partial<BasicAgentState>> {
  const toolMessages: ToolMessage[] = [];

  const toolCalls = (state.messages.at(-1)! as AIMessage).tool_calls!;
  for (const tc of toolCalls) {
    const toolFn = availableTools[tc.name];
    let result = "";
    if (!toolFn) {
      result = `Invalid tool '${tc.name}' was called. Please perform a valid tool call.`;
    } else {
      result = await toolFn.invoke(tc.args);
    }
    toolMessages.push(
      new ToolMessage({
        content: result,
        id: tc.id!,
        tool_call_id: tc.id!,
        additional_kwargs: { tool_call: tc },
      }),
    );
  }

  return {
    messages: toolMessages,
    actions: toolMessages.map((msg, i) => ({
      index: state.actions.length + i,
      title: `Using tool: ${msg.name}`,
      displayContent: msg.content,
    })),
  };
}

async function handoverNode(_state: BasicAgentState) {
  return {
    handover: true,
  };
}

export const BasicAgent = new StateGraph(BasicAgentStateAnnotation)
  .addNode("llm", llmNode)
  .addNode("tools", toolsNode)
  .addNode("handover_request", handoverNode)
  .addEdge(START, "llm")
  .addConditionalEdges("llm", ({ messages }) => {
    const lastMsg = messages.at(-1) as AIMessageChunk;
    if (lastMsg && lastMsg.type === "ai") {
      if (
        (lastMsg.tool_calls && lastMsg.tool_calls.length > 0) ||
        (lastMsg.tool_call_chunks && lastMsg.tool_call_chunks.length > 0)
      ) {
        const toolCalls = lastMsg.tool_calls || lastMsg.tool_call_chunks;
        if (toolCalls!.find((tc) => tc.name === handoverTool.name)) {
          return "handover_request";
        }
        return "tools";
      }
    }
    return END;
  })
  .addEdge("tools", "llm")
  .addEdge("handover_request", END)
  .compile({ name: "BasicAgent" });
