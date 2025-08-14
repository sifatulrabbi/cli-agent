import dotenv from "dotenv";
dotenv.config();

import { render } from "ink";
import { App } from "@/cli";
import { toolsSet1 } from "@/toolsSet1";

const THREAD_ID = process.env.THREAD_ID ?? "default";

render(<App model="gpt41mini" historyPath={THREAD_ID} tools={toolsSet1} />);
