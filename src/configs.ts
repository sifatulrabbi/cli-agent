import dotenv from "dotenv";

if (!process.env.NODE_ENV) {
  dotenv.config();
}

export const WORKSPACE_ROOT = process.cwd();
export const TESTING_DIR = "/Users/sifatul/coding/js-playground/testBench/";
// export const ACTIVE_PROJECT_DIR = "project1"; // gpt-4.1
// export const ACTIVE_PROJECT_DIR = "project2"; // o4-mini-medium
// export const ACTIVE_PROJECT_DIR = "project3"; // gpt-oss-20b-high
export const ACTIVE_PROJECT_DIR = "project4"; // gpt-oss-20b-high
export const DEFAULT_LOGGING_PATH =
  "/Users/sifatul/coding/js-playground/tmp/logs";
