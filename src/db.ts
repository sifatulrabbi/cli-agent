import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import path from "path";
import fs from "fs";
import {
  BaseMessage,
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";

export type SqliteDb = Database<sqlite3.Database, sqlite3.Statement>;

const DEFAULT_DB_DIR = path.join(process.cwd(), ".cli-agent");
const DEFAULT_DB_PATH = path.join(DEFAULT_DB_DIR, "conversations.sqlite");

export async function initializeDatabase(
  dbFilePath: string = DEFAULT_DB_PATH,
): Promise<SqliteDb> {
  if (!fs.existsSync(path.dirname(dbFilePath))) {
    fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
  }
  const db = await open({ filename: dbFilePath, driver: sqlite3.Database });
  await db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, id);
  `);
  return db as SqliteDb;
}

export const db = await initializeDatabase();

export async function saveMessages(
  db: SqliteDb,
  threadId: string,
  messages: BaseMessage[],
): Promise<void> {
  await db.exec("BEGIN");
  try {
    await db.run("DELETE FROM messages WHERE thread_id = ?", threadId);
    const insert = await db.prepare(
      "INSERT INTO messages (thread_id, type, payload) VALUES (?, ?, ?)",
    );
    for (const msg of messages) {
      const type = msg.getType();
      const payload = JSON.stringify(msg.toJSON());
      await insert.run(threadId, type, payload);
    }
    await insert.finalize();
    await db.exec("COMMIT");
  } catch (e) {
    await db.exec("ROLLBACK");
    throw e;
  }
}

export async function appendMessage(
  db: SqliteDb,
  threadId: string,
  message: BaseMessage,
): Promise<void> {
  await db.run(
    "INSERT INTO messages (thread_id, type, payload) VALUES (?, ?, ?)",
    threadId,
    message.getType(),
    JSON.stringify(message.toJSON()),
  );
}

export async function clearThread(
  db: SqliteDb,
  threadId: string,
): Promise<void> {
  await db.run("DELETE FROM messages WHERE thread_id = ?", threadId);
}

export async function loadMessages(
  db: SqliteDb,
  threadId: string,
): Promise<BaseMessage[]> {
  const rows = await db.all<{ type: string; payload: string }[]>(
    "SELECT type, payload FROM messages WHERE thread_id = ? ORDER BY id ASC",
    threadId,
  );
  return rows.map(({ type, payload }) => deserializeMessage(type, payload));
}

function deserializeMessage(type: string, payloadJson: string): BaseMessage {
  try {
    const entry = JSON.parse(payloadJson);
    const kwargs = entry?.kwargs ?? {};
    switch (type) {
      case "human":
      case "HumanMessage":
        return new HumanMessage(kwargs);
      case "ai":
      case "AIMessage":
      case "AIMessageChunk":
        return new AIMessage(kwargs);
      case "tool":
      case "ToolMessage":
      case "ToolMessageChunk":
        return new ToolMessage(kwargs);
      case "system":
      case "SystemMessage":
        return new SystemMessage(kwargs);
      default:
        return new AIMessage({
          content: "[Unsupported message type encountered]",
        });
    }
  } catch {
    return new AIMessage({ content: "[Failed to parse stored message]" });
  }
}

export function getDefaultDbPath(): string {
  return DEFAULT_DB_PATH;
}
