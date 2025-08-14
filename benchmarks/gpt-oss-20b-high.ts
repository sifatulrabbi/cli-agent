import { toolsSet1 } from "@/toolsSet1";
import { invokeAgent as invokeAgent } from "@/agent";
import { ensureHistoryFileExists } from "@/utils";

const historyPath = `benchmarks/results/gpt-oss-20b-high.json`;
ensureHistoryFileExists(historyPath);
await invokeAgent("gptOss20bHigh", toolsSet1, { historyPath }, () => {});
