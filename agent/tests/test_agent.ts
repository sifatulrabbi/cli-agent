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
  const userInput = await askQuestion("USER: ");

  if (["q", "/exit", "exit", "quit", "/quit"].includes(userInput.trim())) {
    rl.close();
    process.exit(0);
  }

  // process.stdout.write("AI: ");
  console.log("AI:");

  const stream = await workflow.stream(
    { userInput: userInput },
    { streamMode: "messages" },
  );
  const chunks: any[] = [];
  for await (const step of stream) {
    chunks.push(step);
    console.log(step);
  }

  console.log();
  console.log("total streamed chunks:", chunks.length);
  console.log("-".repeat(80));
  console.log();
}
