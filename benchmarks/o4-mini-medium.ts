import { toolsSet1 } from "@/toolsSet1";
import { invokeAgent as invokeAgent } from "@/agent";
import { ensureHistoryFileExists } from "@/utils";

const historyPath = `benchmarks/results/o4-mini-medium.json`;
ensureHistoryFileExists(historyPath);
await invokeAgent("o4MiniHigh", toolsSet1, { historyPath }, () => {});
