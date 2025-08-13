import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { TESTING_DIR, ACTIVE_PROJECT_DIR } from "./configs";
import { tryCatch } from "./utils";

const projectRootDir = path.join(TESTING_DIR, ACTIVE_PROJECT_DIR);

export function buildPathFromRootDir(entryPath: string) {
  const relativePath = path.relative(projectRootDir, entryPath);
  return path.join(projectRootDir, relativePath);
}

async function traverseDir(dirPath: string, depth = 0) {
  const entries = await fs.readdir(dirPath);
  let formattedEntries = "";

  for (const entry of entries) {
    const entryPath = path.join(projectRootDir, entry);
    const { data: isDirectory } = await tryCatch(() =>
      fs.stat(entryPath).then((stat) => stat.isDirectory()),
    );

    if (formattedEntries.trim()) formattedEntries += `\n`;
    formattedEntries += `${"  ".repeat(depth)}${ACTIVE_PROJECT_DIR}/${entry}`;
    if (isDirectory) {
      formattedEntries += `/`;
      formattedEntries += await traverseDir(entryPath, depth + 1);
    }
  }

  return formattedEntries;
}

export const listProjectFilesTool = tool(
  async () => {
    const entries = await traverseDir(projectRootDir);
    return `<project-entries>\n${entries}\n</project-entries>`;
  },
  {
    name: "list_project_files_and_dirs_tool",
    description: "List all files of the project.",
    schema: z.object({}),
  },
);

export const createEntityTool = tool(
  async ({
    entityType,
    entityName,
    content,
  }: {
    entityPath: string;
    entityType: string;
    entityName: string;
    content: string;
  }) => {
    // check if the entity already exists
    const entityPath = buildPathFromRootDir(entityName);
    const { data: isADir } = await tryCatch(() => fs.readdir(entityPath));
    if (isADir) {
      return `The '${entityName}' directory already exists.`;
    }
    const { data: isAFile } = await tryCatch(() => fs.readFile(entityPath));
    if (isAFile) {
      return `The '${entityName}' file already exists.`;
    }

    // if does not exist then create the entity based on the entity type
    if (entityType === "dir") {
      await fs.mkdir(entityPath, { recursive: true });
    } else {
      await fs.writeFile(entityPath, content);
    }
    return `The '${entityName}' ${entityType} has been created${
      entityType === "dir" ? "." : "with the content."
    }.`;
  },
  {
    name: "create_entity_tool",
    description:
      "Create an entity either a directory or a file in the project.",
    schema: z.object({
      entityPath: z.string().describe("The path of the entity to create"),
      entityType: z
        .enum(["dir", "file"])
        .describe("The type of the entity to create"),
      entityName: z.string().describe("The name of the entity to create"),
      content: z
        .string()
        .describe(
          "The content of the entity to create. Note for directories please return empty string.",
        ),
    }),
  },
);

export const removeEntityTool = tool(
  async ({ entityPath }: { entityPath: string }) => {
    const fullPath = buildPathFromRootDir(entityPath);
    const { data: isADir } = await tryCatch(() => fs.stat(fullPath));
    if (isADir) {
      await fs.rmdir(fullPath, { recursive: true });
      return `The '${entityPath}' directory has been removed.`;
    }

    const { data: isAFile } = await tryCatch(() => fs.readFile(fullPath));
    if (isAFile) {
      await fs.unlink(fullPath);
      return `The '${entityPath}' file has been removed.`;
    }

    return `The '${entityPath}' does not exist.`;
  },
  {
    name: "remove_entity_tool",
    description:
      "Remove an entity either a directory or a file from the project. Must provide the full path. (Note: the full path can be obtained by using the list_project_files_and_dirs_tool tool.)",
    schema: z.object({
      entityPath: z.string().describe("The path of the entity to remove"),
    }),
  },
);

export const patchTextFileTool = tool(
  async ({
    filePath,
    patches,
  }: {
    filePath: string;
    patches: {
      startLine: number;
      endLine: number;
      content: string;
    }[];
  }) => {
    const fullPath = buildPathFromRootDir(filePath);
    const { data: fileContent, error: readError } = await tryCatch(() =>
      fs.readFile(fullPath, "utf-8"),
    );

    if (readError || fileContent === null) {
      return `The '${filePath}' file does not exist or could not be read.`;
    }

    // Detect and preserve the original EOL style (\r\n, \n, or \r)
    const isEmptyFile = fileContent.length === 0;
    const eolMatch = isEmptyFile ? null : fileContent.match(/\r\n|\n|\r/);
    const eol = eolMatch ? eolMatch[0] : "\n";
    const originalLines = isEmptyFile ? [] : fileContent.split(/\r\n|\n|\r/);
    const lastLineNumber = originalLines.length; // 1-based last line number (0 for empty file)

    // Validate patches first
    const validationErrors: string[] = [];
    patches.forEach((p, index) => {
      const { startLine, endLine } = p;
      const isInsertAtBeginning = startLine === 0 && endLine === 1;
      // For empty files, allow insertion at end with startLine=0,endLine=0 for convenience
      const isInsertAtEnd =
        (startLine === lastLineNumber && endLine === 0) ||
        (lastLineNumber === 0 && startLine === 0 && endLine === 0);
      const isNormalRange =
        startLine >= 1 &&
        endLine >= 1 &&
        startLine <= endLine &&
        endLine <= lastLineNumber;

      if (!(isInsertAtBeginning || isInsertAtEnd || isNormalRange)) {
        validationErrors.push(
          `Patch ${
            index + 1
          } has invalid line range: startLine=${startLine}, endLine=${endLine}. File has ${lastLineNumber} lines.`,
        );
      }
    });

    if (validationErrors.length > 0) {
      return `Could not apply patches for '${filePath}':\n${validationErrors.join(
        "\n",
      )}`;
    }

    // Apply patches in descending order of start line to avoid index shifts
    const sortedPatches = [...patches].sort((a, b) => {
      // Put insert-at-end last (highest), then normal ranges by start desc, then insert-at-beginning first
      const rank = (p: { startLine: number; endLine: number }) => {
        if (p.startLine === 0 && p.endLine === 1) return -1; // beginning inserts first
        if (p.startLine === lastLineNumber && p.endLine === 0) return 1; // end inserts last
        return 0;
      };

      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      return b.startLine - a.startLine;
    });

    let lines = [...originalLines];

    for (const patch of sortedPatches) {
      const { startLine, endLine, content } = patch;
      const newLines = content.length > 0 ? content.split(/\r\n|\n|\r/) : [];

      if (startLine === 0 && endLine === 1) {
        // Insert at beginning (before line 1)
        lines = [...newLines, ...lines];
        continue;
      }

      if (
        (startLine === lastLineNumber && endLine === 0) ||
        (lastLineNumber === 0 && startLine === 0 && endLine === 0)
      ) {
        // Insert at end
        lines = [...lines, ...newLines];
        continue;
      }

      // Replace lines in [startLine, endLine] inclusive (1-based)
      const startIndex = startLine - 1;
      const deleteCount = endLine - startLine + 1;
      lines.splice(startIndex, deleteCount, ...newLines);
    }

    const updatedContent = lines.join(eol);
    const { error: writeError } = await tryCatch(() =>
      fs.writeFile(fullPath, updatedContent, "utf-8"),
    );

    if (writeError) {
      return `Failed to write changes to '${filePath}'.`;
    }

    return `Applied ${patches.length} patch(es) to '${filePath}'.`;
  },
  {
    name: "patch_text_file_tool",
    description:
      "Patch a text file in the project. Must provide the full path. (Note: the full path can be obtained by using the list_project_files_and_dirs_tool tool.). To insert at the beginning of the file return 0 for startLine and 1 for endLine. To insert at the end of the file return the last line number for startLine and 0 for endLine. For the rest of the operations, return the appropriate line start and end numbers.",
    schema: z.object({
      filePath: z.string().describe("The path of the file to patch"),
      patches: z
        .array(
          z.object({
            startLine: z
              .number()
              .describe("The start line of the content to patch"),
            endLine: z
              .number()
              .describe("The end line of the content to patch"),
            content: z
              .string()
              .describe(
                "The content to patch. To remove lines return empty content.",
              ),
          }),
        )
        .describe(
          "The patches to apply on the file. Based on the need return either one or multiple patches.",
        ),
    }),
  },
);

export const toolsSet1 = [
  listProjectFilesTool,
  createEntityTool,
  removeEntityTool,
  patchTextFileTool,
];
