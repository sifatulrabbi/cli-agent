import fs from "fs";
import { DEFAULT_LOGGING_PATH } from "@/configs";
import path from "path";

class LibLogger {
  public readonly logFilePath: string;

  constructor(logDirPath = DEFAULT_LOGGING_PATH) {
    // making sure the dir exists
    try {
      fs.readdirSync(logDirPath);
    } catch {
      fs.mkdirSync(logDirPath, { recursive: true });
    }

    this.logFilePath = path.join(logDirPath, "log.txt");
    if (!fs.existsSync(this.logFilePath)) {
      fs.writeFileSync(this.logFilePath, "");
    }
  }

  log(...args: any[]) {
    const timestamp = new Date().toISOString();
    let logEntry = timestamp + " - INFO\n";
    for (const arg of args) {
      logEntry += JSON.stringify(arg, null, 2) + "\n";
    }
    fs.appendFileSync(this.logFilePath, logEntry);
  }

  error(...args: any[]) {
    const timestamp = new Date().toISOString();
    let logEntry = timestamp + " - ERROR\n";
    for (const arg of args) {
      logEntry += JSON.stringify(arg, null, 2) + "\n";
    }
    fs.appendFileSync(this.logFilePath, logEntry);
  }
}

export const logger = new LibLogger();
