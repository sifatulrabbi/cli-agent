#!/usr/bin/env node

import dotenv from "dotenv";
const result = dotenv.config({ path: "../.env" });
if (result.parsed) {
  process.env = {
    ...process.env,
    ...result.parsed,
  };
}
console.clear();

import { render } from "ink";
import { App } from "@/cli";
import { toolsSet1 } from "@/toolsSet1";
import { ModelName, models } from "@/agent/models";

// Simple argument parsing
const args = process.argv.slice(2);
let threadIdArg: string | undefined;
let modelArg: string | undefined;

for (let i = 0; i < args.length; i++) {
  if ((args[i] === "-n" || args[i] === "--name") && args[i + 1]) {
    threadIdArg = args[i + 1];
    i++;
  }
  if ((args[i] === "-m" || args[i] === "--model") && args[i + 1]) {
    modelArg = args[i + 1];
    i++;
  }
}

const THREAD_ID = threadIdArg || process.env.THREAD_ID || "default";
let defaultModel = modelArg || process.env.DEFAULT_MODEL;
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
