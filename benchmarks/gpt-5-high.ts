import { ChatOpenAIResponses } from "@langchain/openai";
import { toolsSet1 } from "@/toolsSet1";
import { invokeAgent as invokeAgent } from "@/agent";
import { ensureHistoryFileExists } from "@/utils";

const llmV2 = new ChatOpenAIResponses({
  model: "gpt-5",
  reasoning: {
    effort: "high",
    summary: "detailed",
  },
});

const historyPath = `benchmarks/results/gpt-5-high.json`;
ensureHistoryFileExists(historyPath);
await invokeAgent(
  llmV2,
  toolsSet1,
  { historyPath, trimReasoning: false },
  () => {},
);
