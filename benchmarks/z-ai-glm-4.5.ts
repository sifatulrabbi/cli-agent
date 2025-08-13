import { ChatOpenAI } from "@langchain/openai";
import { toolsSet1 } from "@/toolsSet1";
import { invokeDebuggerAgent as invokeAgent } from "@/agent";
import { ensureHistoryFileExists } from "@/utils";

const llm = new ChatOpenAI({
  model: "z-ai/glm-4.5v",
  apiKey: process.env.OPENROUTER_API_KEY,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});

const historyPath = `benchmarks/results/z-ai-glm-4.5.json`;
ensureHistoryFileExists(historyPath);
await invokeAgent(llm, toolsSet1, { historyPath });
