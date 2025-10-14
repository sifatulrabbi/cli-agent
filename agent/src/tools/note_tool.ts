import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { readFileSync, writeFileSync } from "fs";

const basePath = "/Users/sifatul/coding/cli-agent/agent/tmp/cli-agent-notes.md";

const UpdateNoteLineSchema = z.object({
  index: z.number().describe("The index of the line to update."),
  text: z
    .string()
    .nullable()
    .optional()
    .describe(
      "The new text to insert in the line. Return 'null' to remove the targeted line from the note.",
    ),
});

const NoteToolArgsSchema = z.object({
  add: z
    .array(z.string())
    .optional()
    .default([])
    .describe("An array containing new lines to add to the note."),
  update: z
    .array(UpdateNoteLineSchema)
    .optional()
    .default([])
    .describe("An array containing note line updates or note line removals."),
});

export const noteTool = tool(
  async ({ add = [], update = [] }: any) => {
    console.log("note_tool:", add, update);

    const content = readFileSync(basePath, "utf-8");
    let lines = content.split("\n");

    if (update && update.length > 0) {
      for (const u of update) {
        if (u.index >= lines.length) {
          continue;
        }
        if (!u.text) {
          // Remove the line
          lines = [...lines.slice(0, u.index), ...lines.slice(u.index + 1)];
        } else {
          // Update the line
          lines[u.index] = u.text;
        }
      }
    }

    if (add && add.length > 0) {
      lines.push(...add);
    }

    writeFileSync(basePath, lines.join("\n"));

    return "Done";
  },
  {
    name: "note",
    description: "Use this tool to manage your notes.",
    schema: NoteToolArgsSchema,
  },
);
