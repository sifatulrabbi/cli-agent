import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { TESTING_DIR, ACTIVE_PROJECT_DIR } from "./configs";
import { tryCatch } from "./utils";
import chalk from "chalk";

const projectRootDir = path.join(TESTING_DIR, ACTIVE_PROJECT_DIR);

export function buildPathFromRootDir(entryPath: string) {
  let sanitizedPath = entryPath;
  if (entryPath.startsWith("/" + ACTIVE_PROJECT_DIR + "/")) {
    sanitizedPath = entryPath.replace("/" + ACTIVE_PROJECT_DIR + "/", "/");
  } else if (entryPath.startsWith(ACTIVE_PROJECT_DIR + "/")) {
    sanitizedPath = entryPath.replace(ACTIVE_PROJECT_DIR + "/", "/");
  }
  return path.join(projectRootDir, sanitizedPath);
}

async function traverseDir(dirPath: string, depth = 0) {
  const entries = await fs.readdir(dirPath);
  const formattedEntries: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(projectRootDir, entry);
    const { data: isDirectory } = await tryCatch(() =>
      fs.stat(entryPath).then((stat) => stat.isDirectory()),
    );

    if (isDirectory) {
      formattedEntries.push(`/${entry}/`);
      const subEntries = await traverseDir(entryPath, depth + 1);
      formattedEntries.push(...subEntries.map((e) => `/${entry}${e}`));
    } else {
      formattedEntries.push(`/${entry}`);
    }
  }

  return formattedEntries;
}

export const listProjectFilesTool = tool(
  async () => {
    console.log(
      chalk.green(
        `Using list_project_files_and_dirs_tool (dir: ${ACTIVE_PROJECT_DIR}/)...`,
      ),
    );
    const entries = await traverseDir(projectRootDir);
    console.log(
      chalk.gray("Successfully listed project files and directories."),
    );
    return `<project-entries>\n${entries
      .map((e) => `${ACTIVE_PROJECT_DIR}${e}`)
      .join("\n")}\n</project-entries>`;
  },
  {
    name: "list_project_files_and_dirs_tool",
    description: "List all files of the project.",
    schema: z.object({}),
  },
);

export const readFilesTool = tool(
  async ({ filePaths }: { filePaths: string[] }) => {
    console.log(
      chalk.green(`Using read_files_tool (files: ${filePaths.join(", ")})...`),
    );
    const fullPaths = filePaths.map((filePath) =>
      buildPathFromRootDir(filePath),
    );
    const { data: fileContents } = await tryCatch(() =>
      Promise.all(fullPaths.map((fullPath) => fs.readFile(fullPath, "utf-8"))),
    );
    if (fileContents === null) {
      return `The '${filePaths.join(
        ", ",
      )}' files do not exist or could not be read.`;
    }
    const sections = filePaths.map((originalPath, index) => {
      const content = fileContents[index] ?? "";
      return `File: ${originalPath}\n${content}`;
    });
    console.log(chalk.gray(`Successfully read files: ${filePaths.join(", ")}`));
    return sections.join("\n\n");
  },
  {
    name: "read_files_tool",
    description:
      "Read multiple files in the project. Must provide the full path. (Note: the full path can be obtained by using the list_project_files_and_dirs_tool tool.)",
    schema: z.object({
      filePaths: z.array(z.string()).describe("The paths of the files to read"),
    }),
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
    console.log(
      chalk.green(
        `Using create_entity_tool (target: ${entityName}, type: ${entityType})...`,
      ),
    );
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
    console.log(
      chalk.gray(`Successfully created entity: ${entityName} (${entityType})`),
    );
    const entireProjectList = await listProjectFilesTool.invoke({});
    return `The '${entityName}' ${entityType} has been created${
      entityType === "dir" ? "." : "with the content."
    }\n\n${entireProjectList}`;
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
    console.log(
      chalk.green(`Using remove_entity_tool (target: ${entityPath})...`),
    );

    const fullPath = buildPathFromRootDir(entityPath);
    const { data: isADir } = await tryCatch(() => fs.stat(fullPath));
    if (isADir) {
      await fs.rmdir(fullPath, { recursive: true });
      const entireProjectList = await listProjectFilesTool.invoke({});
      console.log(
        chalk.gray(`Successfully removed entity: ${entityPath} (directory)`),
      );
      return `The '${entityPath}' directory has been removed.\n\n${entireProjectList}`;
    }

    const { data: isAFile } = await tryCatch(() => fs.readFile(fullPath));
    if (isAFile) {
      await fs.unlink(fullPath);
      const entireProjectList = await listProjectFilesTool.invoke({});
      console.log(
        chalk.gray(`Successfully removed entity: ${entityPath} (file)`),
      );
      return `The '${entityPath}' file has been removed.\n\n${entireProjectList}`;
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

export const insertIntoTextFileTool = tool(
  async ({
    filePath,
    inserts,
  }: {
    filePath: string;
    inserts: { insertAfter: number; content: string }[];
  }) => {
    console.log(
      chalk.green(
        `Using insert_into_text_file_tool (file: ${filePath}, inserts: ${inserts.length})...`,
      ),
    );

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

    let lines = [...originalLines];
    for (const insert of inserts) {
      const { insertAfter, content } = insert;
      const newLines = content.split(/\r\n|\n|\r/);
      lines = [
        ...lines.slice(0, insertAfter),
        ...newLines,
        ...lines.slice(insertAfter),
      ];
    }

    const updatedContent = lines.join(eol);
    const { error: writeError } = await tryCatch(() =>
      fs.writeFile(fullPath, updatedContent, "utf-8"),
    );
    if (writeError) {
      console.error(writeError);
      return `Failed to write changes to '${filePath}'.`;
    }

    console.log(
      chalk.gray(
        `Successfully inserted ${
          lines.length - originalLines.length
        } line(s) into '${filePath}'`,
      ),
    );

    const updatedFile = await readFilesTool.invoke({ filePaths: [filePath] });
    return `Inserted ${lines.length} line(s) into '${filePath}'.\n\nHere is the updated file:\n\n${updatedFile}`;
  },
  {
    name: "insert_into_text_file_tool",
    description:
      "Insert content into a text file in the project. Must provide the full path. (Note: the full path can be obtained by using the list_project_files_and_dirs_tool tool.)",
    schema: z.object({
      filePath: z.string().describe("The path of the file to insert into"),
      inserts: z.array(
        z.object({
          insertAfter: z
            .number()
            .describe("The line number after which to insert the content."),
          content: z.string().describe("The content to insert"),
        }),
      ),
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
    console.log(
      chalk.green(
        `Using patch_text_file_tool (file: ${filePath}, patches: ${patches.length})...`,
      ),
    );

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
      const isNormalRange =
        startLine >= 1 &&
        endLine >= 1 &&
        startLine <= endLine &&
        endLine <= lastLineNumber;

      if (!isNormalRange) {
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
    const sortedPatches = [...patches].sort(
      (a, b) => b.startLine - a.startLine,
    );
    let lines = [...originalLines];

    for (const patch of sortedPatches) {
      const { startLine, endLine, content } = patch;
      const newLines = content.length > 0 ? content.split(/\r\n|\n|\r/) : [];
      const startIndex = startLine - 1;
      lines = [
        ...lines.slice(0, startIndex),
        ...newLines,
        ...lines.slice(endLine),
      ];
    }

    const updatedContent = lines.join(eol);
    const { error: writeError } = await tryCatch(() =>
      fs.writeFile(fullPath, updatedContent, "utf-8"),
    );

    if (writeError) {
      return `Failed to write changes to '${filePath}'.`;
    }

    console.log(
      chalk.gray(
        `Successfully patched '${filePath}' with ${patches.reduce(
          (acc, p) => acc + (p.endLine - p.startLine + 1),
          0,
        )} line(s).`,
      ),
    );

    const updatedFile = await readFilesTool.invoke({ filePaths: [filePath] });
    return `Applied ${patches.length} patch(es) to '${filePath}'.\n\nHere is the updated file:\n\n${updatedFile}`;
  },
  {
    name: "patch_text_file_tool",
    description:
      "Patch a text file by replacing existing line ranges only. Insertion is not supported here; use insert_into_text_file_tool for insertions. Must provide the full path (obtainable via list_project_files_and_dirs_tool).",
    schema: z.object({
      filePath: z.string().describe("The path of the file to patch"),
      patches: z
        .array(
          z.object({
            startLine: z
              .number()
              .describe("The start line of the range to replace (1-based)"),
            endLine: z
              .number()
              .describe("The end line of the range to replace (1-based)"),
            content: z
              .string()
              .describe(
                "Replacement content. Use empty string to delete the specified range.",
              ),
          }),
        )
        .describe(
          "The patches to apply on the file. Each patch replaces the specified existing range.",
        ),
    }),
  },
);

export const toolsSet1 = [
  listProjectFilesTool,
  createEntityTool,
  removeEntityTool,
  patchTextFileTool,
  insertIntoTextFileTool,
  readFilesTool,
];
