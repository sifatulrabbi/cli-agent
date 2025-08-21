import { toolsSet1 } from "@/toolsSet1";
import { invokeAgent as invokeAgent } from "@/agent";
import { ensureHistoryFileExists } from "@/utils";

const historyPath = `benchmarks/results/gpt-5-high.json`;
ensureHistoryFileExists(historyPath);
await invokeAgent("gpt5High", toolsSet1, { historyPath }, () => {});
