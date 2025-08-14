import dotenv from "dotenv";
dotenv.config();

import { render } from "ink";
import { App } from "@/cli";
import { toolsSet1 } from "@/toolsSet1";
import { ModelName, models } from "@/agent/models";

const THREAD_ID = process.env.THREAD_ID ?? "default";
let defaultModel = process.env.DEFAULT_MODEL;
if (!defaultModel || !Object.keys(models).includes(defaultModel)) {
  defaultModel = "gpt41mini";
}

render(
  <App
    model={defaultModel as ModelName}
    historyPath={THREAD_ID}
    tools={toolsSet1}
  />,
);
