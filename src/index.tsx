import dotenv from "dotenv";
dotenv.config();

import { render } from "ink";
import { App } from "@/cli";
import { toolsSet1 } from "@/toolsSet1";

const HISTORY_PATH = "testBench/gpt-oss-120b.json";

render(<App model="gptOss120b" historyPath={HISTORY_PATH} tools={toolsSet1} />);
