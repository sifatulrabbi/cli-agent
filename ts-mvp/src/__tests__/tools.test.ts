import path from "path";
import { TESTING_DIR, ACTIVE_PROJECT_DIR } from "@/configs";
import {
  createEntityTool,
  listProjectFilesTool,
  patchTextFileTool,
  buildPathFromRootDir,
  insertIntoTextFileTool,
  readFilesTool,
} from "../toolsSet1";

const projectRootDir = path.join(TESTING_DIR, ACTIVE_PROJECT_DIR);
console.log("Testing project root dir:", projectRootDir);

console.log("Formatted entries:\n%s", await listProjectFilesTool.invoke({}));

// these all should return the same path
console.log(buildPathFromRootDir("project1/main.ts"));
console.log(buildPathFromRootDir("/project1/main.ts"));
console.log(buildPathFromRootDir("/main.ts"));
console.log(buildPathFromRootDir("main.ts"));

async function createNewFileTest() {
  const newFileContent = `function main() {
  console.log("Hello, world!");
}

main();`;
  const result = await createEntityTool.invoke({
    entityPath: "test.js",
    entityType: "file",
    entityName: "test.js",
    content: newFileContent,
  });
  console.log("Result:", result);
}
await createNewFileTest();

async function insertIntoFileTest() {
  const content = `import fs from "fs";
  
function main() {
  const fileContent = fs.readFileSync("test.txt", "utf8");
  console.log(fileContent);
}
`;
  const result = await insertIntoTextFileTool.invoke({
    filePath: "main.ts",
    inserts: [
      {
        insertAfter: 0,
        content,
      },
    ],
  });
  console.log("Patch Result:", result);
}
await insertIntoFileTest();

async function patchFileTest() {
  const content = `  const f = fs.readFileSync("test.txt", "utf8");
  console.log(f);`;
  const result = await patchTextFileTool.invoke({
    filePath: "main.ts",
    patches: [
      {
        startLine: 4,
        endLine: 5,
        content,
      },
    ],
  });
  console.log("Patch Result:", result);
}
await patchFileTest();

async function readFilesTest() {
  const result = await readFilesTool.invoke({
    filePaths: ["financial_dashboard.py"],
  });
  console.log("Result:\n%s", result);
}
await readFilesTest();
