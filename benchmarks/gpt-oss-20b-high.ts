import { ChatOpenAI } from "@langchain/openai";
import { toolsSet1 } from "@/toolsSet1";
import { invokeDebuggerAgent as invokeAgent } from "@/agent";
import { ensureHistoryFileExists } from "@/utils";

const llm = new ChatOpenAI({
  model: "openai/gpt-oss-20b",
  modelKwargs: {
    reasoning_effort: "high",
  },
  apiKey: process.env.OPENROUTER_API_KEY,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});

const historyPath = `benchmarks/results/gpt-oss-20b-high.json`;
ensureHistoryFileExists(historyPath);
await invokeAgent(llm, toolsSet1, { historyPath });
