import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { StateGraph, START, MessagesAnnotation } from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { Tool } from "langchain/tools";

export type DebuggerAgentOptions = {
  systemInstruction?: string;
};

function defaultSystemInstruction(): string {
  return `
You are a precise debugging assistant for a Node/TypeScript project.
Before answering questions about the codebase, use the available tools to
inspect files and directories as needed. Prefer reading source files over
guessing. Keep answers concise and actionable.
`.trim();
}

function callModelFactory(
  llm: ChatOpenAI,
  sysMsg: SystemMessage,
  tools: Tool[],
) {
  return async function (state: typeof MessagesAnnotation.State) {
    const messages = [sysMsg, ...state.messages];
    const response = await llm.bindTools(tools).invoke(messages);
    return { messages: [response] };
  };
}

export async function invokeDebuggerAgent(
  llm: ChatOpenAI,
  userInput: string,
  options?: DebuggerAgentOptions,
) {
  const tools: Tool[] = [];
  const system = new SystemMessage({
    content: (options?.systemInstruction ?? defaultSystemInstruction()).trim(),
  });
  const toolNode = new ToolNode(tools);

  const graph = new StateGraph(MessagesAnnotation)
    .addNode("llm", callModelFactory(llm, system, tools))
    .addNode("tools", toolNode)
    .addEdge(START, "llm")
    .addConditionalEdges("llm", toolsCondition)
    .addEdge("tools", "llm")
    .compile();

  const result = await graph.invoke({
    messages: [new HumanMessage(userInput)],
  });
  return result;
}

export const debuggerAgent = {};
