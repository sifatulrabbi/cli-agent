import { ChatOpenAI } from "@langchain/openai";
import { toolsSet1 } from "@/toolsSet1";
import { invokeDebuggerAgent as invokeAgent } from "@/agent";
import fs from "fs";

function ensureHistoryFileExists(historyPath: string) {
  if (!fs.existsSync(historyPath)) {
    fs.writeFileSync(historyPath, "[]");
  }
}

async function benchGpt41() {
  const model = "openai/gpt-oss-20b";
  const llm = new ChatOpenAI({
    model,
    reasoning: {
      effort: "high",
    },
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
    },
  });

  const historyPath = `benchmarks/gpt-oss-20b-high.json`;
  ensureHistoryFileExists(historyPath);
  await invokeAgent(llm, toolsSet1, { historyPath });
}

await benchGpt41();
