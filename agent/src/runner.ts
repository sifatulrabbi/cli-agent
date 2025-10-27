#!/usr/bin/env bun

import { z } from "zod";
import { v4 } from "uuid";
import { concat } from "@langchain/core/utils/stream";
import { workflow } from "../src/workflow";
import { type BaseMessage } from "@langchain/core/messages";

type MsgEvent = {
  event: "delta" | "end" | "start";
  history: {
    id: string;
    reasoning: string;
    content: string;
    toolName: string;
    toolArgs: string;
  }[];
};

const inputSchema = z.object({
  workingPath: z.string(),
  userInput: z.string(),
});

function sendEvent(ev: MsgEvent) {
  Bun.stdout.write(JSON.stringify(ev) + "\n");
}

for await (const line of console) {
  const result = inputSchema.parse(JSON.parse(line));

  const stream = await workflow.stream(
    { userInput: result.userInput },
    { streamMode: "messages" },
  );
  sendEvent({
    event: "start",
    history: [
      {
        id: v4(),
        reasoning: "",
        content: result.userInput,
        toolName: "",
        toolArgs: "",
      },
    ],
  });

  const chunks: BaseMessage[] = [];
  let idx = -1;

  for await (const [message, _metadata] of stream) {
    if (!message.id) {
      continue;
    }

    if (chunks[idx] && chunks[idx]!.id === message.id) {
      chunks[idx] = concat(chunks[idx]!, message);
    } else {
      chunks.push(message);
      idx++;
    }

    if (message.type !== "ai") {
      continue;
    }

    message.contentBlocks.forEach((block) => {
      if (block.type.includes("reasoning") && block.reasoning) {
        sendEvent({
          event: "delta",
          history: [
            {
              id: message.id!,
              reasoning: block.reasoning as string,
              content: "",
              toolName: "",
              toolArgs: "",
            },
          ],
        });
      }
      if (block.type.includes("text") && block.text) {
        sendEvent({
          event: "delta",
          history: [
            {
              id: message.id!,
              reasoning: "",
              content: block.text as string,
              toolName: "",
              toolArgs: "",
            },
          ],
        });
      }
    });
  }

  sendEvent({
    event: "end",
    history: chunks.map((c) => {
      const ev: MsgEvent["history"][number] = {
        id: c.id!,
        reasoning: "",
        content: "",
        toolName: "",
        toolArgs: "",
      };

      c.contentBlocks.forEach((b) => {
        if (typeof b.reasoning === "string" && b.reasoning.trim()) {
          ev.reasoning = b.reasoning;
        }
        if (typeof b.text === "string" && b.text.trim()) {
          ev.content = b.text;
        }
      });

      return ev;
    }),
  });
}
