import { ChatOpenAI } from "@langchain/openai";
import { toolsSet1 } from "@/toolsSet1";
import { invokeDebuggerAgent as invokeAgent } from "@/agent";
import { ensureHistoryFileExists } from "@/utils";

const llm = new ChatOpenAI({
  model: "o4-mini",
  useResponsesApi: true,
  reasoning: {
    effort: "high",
    summary: "auto",
  },
});

const historyPath = `benchmarks/results/o4-mini-medium.json`;
ensureHistoryFileExists(historyPath);
await invokeAgent(llm, toolsSet1, { historyPath }, () => {});
