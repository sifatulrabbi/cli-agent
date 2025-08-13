import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { tool } from "@langchain/core/tools";

const WORKSPACE_ROOT = process.cwd();

function resolveSafePath(absoluteAllowedRoots: string[], relativePath: string) {
  if (!relativePath || typeof relativePath !== "string") {
    throw new Error("Invalid path");
  }
  if (path.isAbsolute(relativePath)) {
    throw new Error(
      "Absolute paths are not allowed; use project-relative paths",
    );
  }
  const normalizedRelative = path.normalize(relativePath);
  const absoluteCandidate = path.resolve(WORKSPACE_ROOT, normalizedRelative);
  for (const allowedRoot of absoluteAllowedRoots) {
    if (
      absoluteCandidate === allowedRoot ||
      absoluteCandidate.startsWith(allowedRoot + path.sep)
    ) {
      return absoluteCandidate;
    }
  }
  throw new Error(
    `Path '${relativePath}' is outside allowed directories: ${absoluteAllowedRoots
      .map((p) => path.relative(WORKSPACE_ROOT, p) || ".")
      .join(", ")}`,
  );
}

async function listDirectoryImmediate(absolutePath: string): Promise<string[]> {
  const entries = await fs.readdir(absolutePath, { withFileTypes: true });
  const collected: string[] = [];
  for (const entry of entries) {
    const full = path.join(absolutePath, entry.name);
    collected.push(full);
  }
  return collected;
}

export function createListDirectoryTool(absoluteAllowedRoots: string[]) {
  return tool(
    async ({ directory }: { directory: string }) => {
      const absolute = resolveSafePath(absoluteAllowedRoots, directory);
      const items = await listDirectoryImmediate(absolute);
      const relativeItems = items.map((p) => path.relative(WORKSPACE_ROOT, p));
      return JSON.stringify({
        directory: path.relative(WORKSPACE_ROOT, absolute),
        items: relativeItems,
      });
    },
    {
      name: "list_directory",
      description:
        "List immediate children in a directory relative to the project root (no recursion).",
      schema: z.object({
        directory: z.string().describe("Directory path, e.g. 'src'"),
      }),
    },
  );
}

export function createReadTextFileTool(absoluteAllowedRoots: string[]) {
  return tool(
    async ({ filePath, maxBytes }: { filePath: string; maxBytes?: number }) => {
      const absolute = resolveSafePath(absoluteAllowedRoots, filePath);
      const data = await fs.readFile(absolute);
      const limit =
        typeof maxBytes === "number" && maxBytes > 0 ? maxBytes : 200_000; // ~200 KB
      const truncated = data.slice(0, limit).toString("utf8");
      const wasTruncated = data.length > limit;
      return JSON.stringify({
        file: path.relative(WORKSPACE_ROOT, absolute),
        bytes: data.length,
        truncated: wasTruncated,
        content: truncated,
      });
    },
    {
      name: "read_text_file",
      description:
        "Read a UTF-8 text file under allowed directories. Optionally cap bytes.",
      schema: z.object({
        filePath: z.string().describe("Path to file, e.g. 'src/cli.tsx'"),
        maxBytes: z.number().int().positive().optional(),
      }),
    },
  );
}

export function createWriteDebugFileTool(absoluteAllowedRoots: string[]) {
  return tool(
    async ({ filePath, content }: { filePath: string; content: string }) => {
      const targetRelative = path.join("generated", "debug", filePath);
      const absolute = resolveSafePath(absoluteAllowedRoots, targetRelative);
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      await fs.writeFile(absolute, content ?? "", "utf8");
      return JSON.stringify({
        status: "ok",
        file: path.relative(WORKSPACE_ROOT, absolute),
      });
    },
    {
      name: "write_debug_file",
      description:
        "Write a text file under 'generated/debug/'. Use for logs, summaries, or notes.",
      schema: z.object({
        filePath: z
          .string()
          .min(1)
          .describe("Relative path under generated/debug, e.g. 'notes.txt'"),
        content: z.string().default("").describe("File contents"),
      }),
    },
  );
}

export function createDebuggerTools(absoluteAllowedRoots: string[]) {
  return [
    createListDirectoryTool(absoluteAllowedRoots),
    createReadTextFileTool(absoluteAllowedRoots),
    createWriteDebugFileTool(absoluteAllowedRoots),
  ];
}
