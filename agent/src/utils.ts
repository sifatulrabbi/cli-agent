// import type {
//   AIMessageChunk,
//   AIMessage,
//   HumanMessage,
//   ToolMessage,
// } from "@langchain/core/messages";
// import type {
//   AgentMessage,
//   AgentMessageUser,
//   AgentMessageAI,
//   AgentMessageTool,
// } from "./agent_message";
//
// export function lcAIMsgToAgentMsg<
//   T = AgentMessage | AgentMessageAI | AgentMessageTool | AgentMessageUser,
// >(lcMsg: AIMessageChunk | AIMessage | HumanMessage | ToolMessage): T {
//   return;
// }
//
// export function agentMsgToLcMsg<
//   T = AIMessageChunk | AIMessage | HumanMessage | ToolMessage,
// >(agentMsg: any): T {
//   return;
// }

export async function tryCatch<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; error: null | Error }> {
  try {
    const result = await fn();
    return { result, error: null };
  } catch (error: any) {
    return { result: {} as T, error };
  }
}
