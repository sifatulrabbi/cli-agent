import { toolsSet1 } from "@/toolsSet1";
import { invokeAgent as invokeAgent } from "@/agent";
import { ensureHistoryFileExists } from "@/utils";

const historyPath = `benchmarks/results/gpt-4.1.json`;
ensureHistoryFileExists(historyPath);
await invokeAgent("gpt41", toolsSet1, { historyPath }, () => {});
