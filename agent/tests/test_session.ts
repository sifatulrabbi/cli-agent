import { AIMessageChunk, HumanMessage } from "@langchain/core/messages";
import { Session } from "../src/session";

const session = new Session(__dirname, { sessionRoot: __dirname });
await session.load();
await session.rewriteHistory([]);
console.log("---\n", session.getHistory());

await session.append(new HumanMessage({ content: "Hello" }));
console.log("---\n", session.getHistory().length === 1);

await session.append(new AIMessageChunk({ content: "Hello" }));
console.log("---\n", session.getHistory().length === 2);

await session.load();
console.log("---\n", session.getHistory().length === 2);
