import { execSync } from "child_process";
import { Box, Text } from "ink";
import os from "os";

function formatPathForDisplay(absPath: string): string {
  const home = os.homedir();
  if (absPath.startsWith(home)) return "~" + absPath.slice(home.length);
  return absPath;
}

function getGitBranch(): string | null {
  try {
    const out = execSync("git rev-parse --abbrev-ref HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return out || null;
  } catch {
    return null;
  }
}

export const HeaderBar: React.FC = () => {
  const cwd = formatPathForDisplay(process.cwd());
  const branch = getGitBranch();
  return (
    <>
      <Box height={1} flexShrink={0}>
        <Text bold>Cli Agent</Text>
      </Box>
      <Box height={1} flexShrink={0}>
        <Text dimColor>
          {cwd}
          {branch ? ` · ${branch}` : ""}
        </Text>
      </Box>
    </>
  );
};
