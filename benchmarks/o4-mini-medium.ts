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
  const modelName = "o4-mini";
  const llm = new ChatOpenAI({
    modelName,
    useResponsesApi: true,
    reasoning: {
      effort: "medium",
      summary: "auto",
    },
  });

  const historyPath = `benchmarks/o4-mini-medium.json`;
  ensureHistoryFileExists(historyPath);
  await invokeAgent(llm, toolsSet1, { historyPath });
}

await benchGpt41();
