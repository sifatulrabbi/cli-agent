import readline from "readline";
import { workflow } from "../src/workflow";
import { concat } from "@langchain/core/utils/stream";
import type { BaseMessage, StoredMessage } from "@langchain/core/messages";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
};

while (true) {
  const userInput = await askQuestion("USER: ");

  if (["q", "/exit", "exit", "quit", "/quit"].includes(userInput.trim())) {
    rl.close();
    process.exit(0);
  }

  process.stdout.write("AI: ");

  const stream = await workflow.stream(
    { userInput: userInput },
    { streamMode: "messages" },
  );

  const chunks: BaseMessage[] = [];
  let idx = -1;
  let previousBlockWasReasoning = false;

  for await (const [message, _metadata] of stream) {
    if (!message.id) {
      continue;
    }

    if (chunks[idx] && chunks[idx]!.id === message.id) {
      chunks[idx] = concat(chunks[idx]!, message);
    } else {
      chunks.push(message);
      idx++;
      if (message.type === "ai") {
        process.stdout.write("\n");
      }
    }

    if (message.type !== "ai") {
      previousBlockWasReasoning = false;
      continue;
    }

    message.contentBlocks.forEach((block) => {
      if (block.type.includes("reasoning") && block.reasoning) {
        if (!previousBlockWasReasoning) {
          previousBlockWasReasoning = true;
        }
        process.stdout.write(block.reasoning as string);
      }

      if (block.type.includes("text") && block.text) {
        if (previousBlockWasReasoning) {
          previousBlockWasReasoning = false;
          process.stdout.write("\n---\n");
        }
        process.stdout.write(block.text as string);
      }
    });
  }

  await Bun.write(
    "./tests/log-dump.ignore.json",
    JSON.stringify(chunks, undefined, 2),
  );

  console.log();
  console.log("-".repeat(80));
  console.log();
}
