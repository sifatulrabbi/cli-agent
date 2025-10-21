import {
  START,
  END,
  Annotation,
  MessagesAnnotation,
  StateGraph,
} from "@langchain/langgraph";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import {
  type AIMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { Tools } from "../tools/";
import { ChatOpenAIResponses } from "@langchain/openai";
import { basicCodingAgentPrompt } from "../prompts/basic_coding_agent_prompt";

const BasicAgentStateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
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

const availableTools: Record<string, DynamicStructuredTool> = {
  [Tools.bashTool.name]: Tools.bashTool,
  [Tools.noteTool.name]: Tools.noteTool,
};

async function llmNode(
  state: BasicAgentState,
): Promise<Partial<BasicAgentState>> {
  const llm = new ChatOpenAIResponses({
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-5-mini",
    reasoning: {
      effort: "low",
      summary: "detailed",
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

export const BasicAgent = new StateGraph(BasicAgentStateAnnotation)
  .addNode("llm", llmNode)
  .addNode("tools", toolsNode)
  .addEdge(START, "llm")
  .addEdge("tools", "llm")
  .addConditionalEdges("llm", ({ messages }) => {
    const lastMsg = messages.at(-1) as AIMessage;
    if (lastMsg && lastMsg.type === "ai") {
      if (lastMsg.tool_calls && lastMsg.tool_calls.length > 0) {
        return "tools";
      }
    }
    return END;
  })
  .compile({ name: "BasicAgent" });
