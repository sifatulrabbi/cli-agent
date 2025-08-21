import { toolsSet1 } from "@/toolsSet1";
import { invokeAgent as invokeAgent } from "@/agent";
import { ensureHistoryFileExists } from "@/utils";

const historyPath = `benchmarks/results/z-ai-glm-4.5.json`;
ensureHistoryFileExists(historyPath);
await invokeAgent("zAiGlm45", toolsSet1, { historyPath }, () => {});
