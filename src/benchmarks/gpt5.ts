import fs from "fs";
import { ChatOpenAI } from "@langchain/openai";
import { toolsSet1 } from "../toolsSet1";
import { invokeDebuggerAgent } from "../agent";

async function benchGpt5() {
  const llm = new ChatOpenAI({
    modelName: "gpt-4.1",
    useResponsesApi: true,
    // reasoning: {
    //   effort: "low",
    //   summary: "auto",
    // },
  });
  const result = await invokeDebuggerAgent(
    llm,
    `
Build me a todo app using React and Tailwind CSS. The todo app should have the following features:
1) add a todo
2) delete a todo
3) mark a todo as complete
4) display the todos in a list.
Store/load the todos from the localStorage of the browser.

DO NOT ask for me for follow up questions and start building the app immediately.
`,
    toolsSet1,
  );
  // write the results in to a json file
  fs.writeFileSync(
    "src/benchmarks/gpt-4.1.json",
    JSON.stringify(
      result.messages.map((msg) => msg.toJSON()),
      null,
      2,
    ),
  );
}

await benchGpt5();
