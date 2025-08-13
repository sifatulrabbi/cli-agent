import path from "path";
import { TESTING_DIR, ACTIVE_PROJECT_DIR } from "../configs";
import { listProjectFilesTool } from "../toolsSet1";

const projectRootDir = path.join(TESTING_DIR, ACTIVE_PROJECT_DIR);
console.log("Testing project root dir:", projectRootDir);

console.log("Formatted entries:\n%s", await listProjectFilesTool.invoke({}));
