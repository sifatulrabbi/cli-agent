import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { spawn } from "bun";

const basePath = "/Users/sifatul/coding/cli-agent/agent/tmp/project1";

const dangerousCommands = [
  "del",
  "format",
  "mkfs", // File deletion
  "dd", // Disk operations
  "sudo",
  "su",
  "doas", // Privilege escalation
  "shutdown",
  "reboot",
  "halt",
  "poweroff", // System control
  "kill",
  "killall",
  "pkill", // Process killing
  "chmod",
  "chown",
  "chgrp", // Permission changes
  "crontab", // Scheduled tasks
  "systemctl",
  "service", // Service management
  "iptables",
  "ufw",
  "firewall-cmd", // Firewall
  "passwd",
  "useradd",
  "userdel",
  "groupadd", // User management
  "curl -X POST",
  "curl -X PUT",
  "curl -X DELETE", // Write operations via curl
  "wget --post",
  "wget --method=POST", // Write operations via wget
];

const dangerousPatterns = [
  />\s*\/dev\//, // Writing to device files
  />\s*\/etc\//, // Writing to system config
  />\s*\/sys\//, // Writing to sysfs
  />\s*\/proc\//, // Writing to procfs
  /:\(\)\s*\{/, // Fork bomb pattern
  /chmod\s+(-R\s+)?777/, // Dangerous permissions
  /eval\s+/, // Code evaluation
  /exec\s+/, // Code execution
];

function isCommandSafe(command: string): { safe: boolean; reason: string } {
  const commandLower = command.toLowerCase().trim();

  for (const dangerousCmd of dangerousCommands) {
    const regex = new RegExp(
      `\\b${dangerousCmd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    );
    if (regex.test(commandLower)) {
      return {
        safe: false,
        reason: `Dangerous command detected: ${dangerousCmd}`,
      };
    }
  }

  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      return { safe: false, reason: `Dangerous pattern detected: ${pattern}` };
    }
  }

  return { safe: true, reason: "" };
}

function formatResult(
  stdout: string,
  stderr: string,
  returncode: number,
): string {
  let formatted = `Success: ${returncode === 0 ? "Yes" : "No"}\nReturncode: ${returncode}`;

  if (stdout) {
    formatted += `\n=== STDOUT ===\n${stdout}`;
  }

  if (stderr) {
    formatted += `\n=== STDERR ===\n${stderr}`;
  }

  return formatted.trim();
}

const BashToolArgsSchema = z.object({
  command: z
    .string()
    .describe(
      "The bash command to execute. Do not prefix the bash command with something like '/bin/bash' or 'bash -lc' provide the actual command to execute.",
    ),
  timeout: z
    .number()
    .optional()
    .default(30)
    .describe(
      "A timeout value in seconds for the command. Default is 30 seconds.",
    ),
});

export const bashTool = tool(
  async ({ command, timeout = 30 }: any) => {
    console.log("bash_tool:", command);

    const { safe, reason } = isCommandSafe(command);
    if (!safe) {
      return formatResult("", `SECURITY: Command blocked - ${reason}`, -1);
    }

    const effectiveTimeout = timeout ?? 30;

    try {
      const proc = spawn({
        cmd: ["/bin/bash", "-c", command],
        cwd: basePath,
        stdout: "pipe",
        stderr: "pipe",
      });

      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          proc.kill();
          reject(
            new Error(`Command timed out after ${effectiveTimeout} seconds`),
          );
        }, effectiveTimeout * 1000);
      });

      // Wait for either the process to complete or timeout
      const result = await Promise.race([proc.exited, timeoutPromise]);

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      return formatResult(stdout, stderr, result as number);
    } catch (error) {
      if (error instanceof Error && error.message.includes("timed out")) {
        return formatResult("", error.message, -1);
      }
      return formatResult("", `Error executing command: ${error}`, -1);
    }
  },
  {
    name: "bash",
    description:
      "Use this tool to execute any bash commands within the working directory. The tool will execute your bash command and return to you the stdout and the stderr.",
    schema: BashToolArgsSchema,
  },
);
