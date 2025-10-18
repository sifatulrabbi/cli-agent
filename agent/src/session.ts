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
  private loaded = false;

  constructor(
    public readonly pwd: PathLike,
    public readonly cfg: SessionConfig,
  ) {
    this.loaded = false;
  }

  get sessionId() {
    return this.pwd.toString().replaceAll(" ", "_").replaceAll("/", "-");
  }

  get filePath() {
    return path.join(this.cfg.sessionRoot.toString(), this.sessionId + ".json");
  }

  async load() {
    const sessionFile = Bun.file(this.filePath);
    const { error } = await tryCatch(async () => {
      const data = (await sessionFile.json()) as StoredMessage[];
      this.messages = mapStoredMessagesToChatMessages(data);
    });
    if (error) {
      await sessionFile.write("[]");
      this.messages = [];
    }
    this.loaded = true;
  }

  async save() {
    this.ensureLoaded();

    const sessionFile = Bun.file(this.filePath);
    await sessionFile.write(
      JSON.stringify(this.messages.map((msg) => msg.toDict())),
    );
  }

  ensureLoaded() {
    if (!this.loaded) {
      throw new Error("Please load the session first");
    }
  }

  getHistory() {
    this.ensureLoaded();
    return this.messages;
  }

  async append(msg: BaseMessage) {
    this.ensureLoaded();

    if (msg.id && this.messages.find((m) => m.id === msg.id)) {
      return this.messages;
    }

    this.messages.push(msg);
    await this.save();
    return this.messages;
  }

  async rewriteHistory(messages: BaseMessage[]) {
    this.ensureLoaded();

    this.messages = messages;
    await this.save();
    return this.messages;
  }
}
