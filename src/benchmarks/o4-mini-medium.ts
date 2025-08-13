import { ChatOpenAI } from "@langchain/openai";
import { toolsSet1 } from "../toolsSet1";
import { invokeDebuggerAgent as invokeAgent } from "../agent";
import fs from "fs";

const startingUserMsg = `
Hello! how can you help me?
`;
// Build me a todo app using React 18 and Tailwind CSS 3. The todo app should have the following features:
// 1) add a todo
// 2) delete a todo
// 3) mark a todo as complete
// 4) display the todos in a list.
// Store/load the todos from the localStorage of the browser.

// DO NOT ask for me for follow up questions and start building the app immediately.
// `;

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

  const historyPath = `src/benchmarks/o4-mini-medium.json`;
  ensureHistoryFileExists(historyPath);
  await invokeAgent(llm, startingUserMsg, toolsSet1, { historyPath });
}

await benchGpt41();
