import fs from "fs";
import { DEFAULT_LOGGING_PATH } from "@/configs";

class LibLogger {
  constructor(readonly logPath = DEFAULT_LOGGING_PATH) {
    // making sure the dir exists
    try {
      fs.readdirSync(logPath);
    } catch {
      fs.mkdirSync(logPath, { recursive: true });
    }
  }

  log(...args: any[]) {
    const timestamp = new Date().toISOString();
    let logEntry = timestamp + " - INFO\n";
    for (const arg of args) {
      logEntry += JSON.stringify(arg, null, 2) + "\n";
    }
    fs.appendFileSync(this.logPath, logEntry);
  }

  error(...args: any[]) {
    const timestamp = new Date().toISOString();
    let logEntry = timestamp + " - ERROR\n";
    for (const arg of args) {
      logEntry += JSON.stringify(arg, null, 2) + "\n";
    }
    fs.appendFileSync(this.logPath, logEntry);
  }
}

export const logger = new LibLogger();
