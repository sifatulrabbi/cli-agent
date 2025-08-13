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
  const modelName = "gpt-4.1";
  const llm = new ChatOpenAI({
    modelName,
    useResponsesApi: true,
    // reasoning: {
    //   effort: "low",
    //   summary: "auto",
    // },
  });

  const historyPath = `benchmarks/${modelName}.json`;
  ensureHistoryFileExists(historyPath);
  await invokeAgent(llm, toolsSet1, { historyPath });
}

await benchGpt41();
