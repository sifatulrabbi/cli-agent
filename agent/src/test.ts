import { BaseMessage } from "@langchain/core/messages";
import { runDecideThenExecAgent } from "./agents/decide_then_exec.ts";
import readline from "readline";
import "dotenv/config";

async function main() {
  let history: BaseMessage[] = [];

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
    const userMsg = await askQuestion("USER: ");

    if (["q", "/exit", "exit", "quit", "/quit"].includes(userMsg.trim())) {
      rl.close();
      process.exit(0);
    }

    process.stdout.write("AI: ");

    history = await runDecideThenExecAgent(userMsg, history);

    console.log();
    console.log("-".repeat(80));
    console.log();
  }
}

main();
