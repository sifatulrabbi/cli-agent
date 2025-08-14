import dotenv from "dotenv";
const result = dotenv.config({ path: "../.env" });
if (result.parsed) {
  process.env = {
    ...process.env,
    ...result.parsed,
  };
}

import { render } from "ink";
import { App } from "@/cli";
import { toolsSet1 } from "@/toolsSet1";
import { ModelName, models } from "@/agent/models";

const THREAD_ID = process.env.THREAD_ID ?? "default";
let defaultModel = process.env.DEFAULT_MODEL;
if (!defaultModel || !Object.keys(models).includes(defaultModel)) {
  defaultModel = "gpt5MiniHigh";
}

render(
  <App
    model={defaultModel as ModelName}
    historyPath={THREAD_ID}
    tools={toolsSet1}
  />,
);
