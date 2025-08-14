import dotenv from "dotenv";
dotenv.config();

import { render } from "ink";
import { App } from "@/cli";
import { toolsSet1 } from "@/toolsSet1";

const HISTORY_PATH = "testBench/local-testing.json";

render(<App model="gpt41mini" historyPath={HISTORY_PATH} tools={toolsSet1} />);
