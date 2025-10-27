import type { PathLike } from "bun";
import path from "path";
import {
  mapStoredMessagesToChatMessages,
  type BaseMessage,
  type StoredMessage,
} from "@langchain/core/messages";
import { tryCatch } from "./utils";

export type SessionDataAction = {
  index: string;
  title: string;
  displayContent: string;
  additionalData: Record<string, any>;
  streaming: boolean;
};

export type SessionData = {
  id: string;
  actions: SessionDataAction[];
  messages: StoredMessage[];
};

export type SessionConfig = {
  sessionRoot: PathLike;
};

export class Session {
  private actions: SessionDataAction[] = [];
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
      const data = (await sessionFile.json()) as SessionData;
      this.messages = mapStoredMessagesToChatMessages(data.messages);
      this.actions = data.actions;
    });
    if (error) {
      const s: SessionData = {
        id: this.sessionId,
        actions: [],
        messages: [],
      };
      await sessionFile.write(JSON.stringify(s));
      this.messages = [];
      this.actions = [];
    }
    this.loaded = true;
  }

  async save() {
    this.ensureLoaded();

    const sessionFile = Bun.file(this.filePath);
    await sessionFile.write(
      JSON.stringify({
        id: this.sessionId,
        actions: this.actions,
        messages: this.messages.map((msg) => msg.toDict()),
      }),
    );
  }

  ensureLoaded() {
    if (!this.loaded) {
      throw new Error("Please load the session first");
    }
  }

  getActions() {
    this.ensureLoaded();
    return this.actions;
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

  async rewriteSession({
    actions,
    messages,
  }: {
    actions: SessionDataAction[];
    messages: BaseMessage[];
  }) {
    this.ensureLoaded();

    this.messages = messages;
    this.actions = actions;
    await this.save();
  }
}
