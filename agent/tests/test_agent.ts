import readline from "readline";
import { workflow } from "../src/workflow";

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

  // process.stdout.write("AI: ");
  console.log("AI:");

  const stream = await workflow.stream(
    { userInput: "" },
    { streamMode: "updates" },
  );
  for await (const step of stream) {
    console.log(step);
  }

  console.log();
  console.log("-".repeat(80));
  console.log();
}
