import type { PathLike } from "bun";
import path from "path";
import { z } from "zod";
import {
  mapStoredMessagesToChatMessages,
  type BaseMessage,
  type StoredMessage,
} from "@langchain/core/messages";
import { tryCatch } from "./utils";

export type SessionConfig = {
  sessionRoot: PathLike;
};

export const SessionDataSchema = z.array(
  z.object({
    id: z.string(),
    type: z.enum(["ai", "user", "tool"]),
    rawJSON: z.string(),
  }),
);

export class Session {
  private messages: BaseMessage[] = [];

  constructor(
    public readonly pwd: PathLike,
    public readonly cfg: SessionConfig,
  ) {}

  get sessionId() {
    return this.pwd.toString().replaceAll(" ", "_").replaceAll("/", "-");
  }
  get filePath() {
    return path.join(this.cfg.sessionRoot.toString(), this.sessionId + ".json");
  }

  async load() {
    const sessionFile = Bun.file(this.filePath);
    const { error } = await tryCatch(async () => {
      const data = await sessionFile.json();
      this.messages = mapStoredMessagesToChatMessages(data);
    });
    if (error) {
      await sessionFile.write("[]");
      this.messages = [];
    }
  }

  async save() {
    const sessionFile = Bun.file(this.filePath);
    await sessionFile.write(
      JSON.stringify(this.messages.map((msg) => msg.toDict())),
    );
  }

  getHistory() {
    return this.messages;
  }

  async append(msg: BaseMessage) {
    if (msg.id && this.messages.find((m) => m.id === msg.id)) {
      return this.messages;
    }
    this.messages.push(msg);
    await this.save();
    return this.messages;
  }

  async rewriteHistory(messages: BaseMessage[]) {
    this.messages = messages;
    await this.save();
    return this.messages;
  }
}
