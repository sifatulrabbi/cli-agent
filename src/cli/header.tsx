import React from "react";
import { execSync } from "child_process";
import { Box, Text, Static } from "ink";
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
  const items = React.useMemo(() => [{ id: "header" }], []);
  const cwd = React.useMemo(() => formatPathForDisplay(process.cwd()), []);
  const branch = React.useMemo(() => getGitBranch(), []);

  return (
    <Box flexDirection="column" flexShrink={0}>
      <Static items={items}>
        {(item) => (
          <React.Fragment key={item.id}>
            <Box flexShrink={0}>
              <Text bold>Cli Agent</Text>
            </Box>
            <Box flexShrink={0}>
              <Text dimColor>
                {cwd}
                {branch ? ` · ${branch}` : ""}
              </Text>
            </Box>
          </React.Fragment>
        )}
      </Static>
    </Box>
  );
};
