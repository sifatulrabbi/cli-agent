import { ChatOpenAI } from "@langchain/openai";
import { toolsSet1 } from "@/toolsSet1";
import { invokeDebuggerAgent as invokeAgent } from "@/agent";
import { ensureHistoryFileExists } from "@/utils";

const llm = new ChatOpenAI({
  model: "gpt-4.1",
  useResponsesApi: true,
});

const historyPath = `benchmarks/results/gpt-4.1.json`;
ensureHistoryFileExists(historyPath);
await invokeAgent(llm, toolsSet1, { historyPath });
