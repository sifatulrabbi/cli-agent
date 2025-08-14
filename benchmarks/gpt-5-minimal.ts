import { toolsSet1 } from "@/toolsSet1";
import { invokeAgent as invokeAgent } from "@/agent";
import { ensureHistoryFileExists } from "@/utils";

const historyPath = `benchmarks/results/gpt-5-minimal.json`;
ensureHistoryFileExists(historyPath);
await invokeAgent("gpt5", toolsSet1, { historyPath }, () => {});
