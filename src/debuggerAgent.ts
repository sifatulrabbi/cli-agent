import path from "node:path";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { StateGraph, START, MessagesAnnotation } from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import {
  createDebuggerTools,
} from "./tools.js";

export type DebuggerAgentOptions = {
  /**
   * Optional system instruction. Defaults to a helpful debugging assistant
   * that inspects project files using tools before answering.
   */
  systemInstruction?: string;
  /**
   * Directories (relative to workspace root) that tools are allowed to access.
   * Defaults to ["src", "generated"].
   */
  allowedDirectories?: string[];
};

const WORKSPACE_ROOT = process.cwd();

function defaultSystemInstruction(allowed: string[]): string {
  return `You are a precise debugging assistant for a Node/TypeScript project.
Before answering questions about the codebase, use the available tools to
inspect files and directories as needed. Prefer reading source files over
guessing. Keep answers concise and actionable.

Safety and scope:
- Only access files under: ${allowed.map((d) => `"${d}"`).join(", ")}
- If a requested path is outside allowed directories, refuse and ask for another path.
`;
}

function resolveAllowedRoots(allowedDirectories?: string[]): string[] {
  const directories = allowedDirectories?.length
    ? allowedDirectories
    : ["src", "generated"];
  return directories.map((relativeDir) =>
    path.resolve(WORKSPACE_ROOT, path.normalize(relativeDir)),
  );
}

// Path resolution and safety helpers live in tools.ts now

// tools are now defined in src/tools.ts

export function buildDebuggerGraph(
  llm: ChatOpenAI,
  options?: DebuggerAgentOptions,
) {
  const allowedRoots = resolveAllowedRoots(options?.allowedDirectories);
  const tools = createDebuggerTools(allowedRoots);
  const llmWithTools = llm.bindTools(tools);

  const system = new SystemMessage(
    (
      options?.systemInstruction ??
      defaultSystemInstruction(
        allowedRoots.map((p) => path.relative(WORKSPACE_ROOT, p) || "."),
      )
    ).trim(),
  );

  async function callModel(state: typeof MessagesAnnotation.State) {
    const messages = [system, ...state.messages];
    const response = await llmWithTools.invoke(messages);
    return { messages: [response] };
  }

  const toolNode = new ToolNode(tools);

  return new StateGraph(MessagesAnnotation)
    .addNode("assistant", callModel)
    .addNode("tools", toolNode)
    .addEdge(START, "assistant")
    .addConditionalEdges("assistant", toolsCondition)
    .addEdge("tools", "assistant")
    .compile();
}

export async function invokeDebuggerAgent(
  llm: ChatOpenAI,
  userInput: string,
  options?: DebuggerAgentOptions,
) {
  const graph = buildDebuggerGraph(llm, options);
  const result = await graph.invoke({
    messages: [new HumanMessage(userInput)],
  });
  return result;
}

export const debuggerAgent = {};
