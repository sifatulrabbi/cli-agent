import React from "react";
import { Box, Text, Static } from "ink";
import { Hr } from "@/cli/hr";

export const HeaderBar: React.FC = () => {
  return (
    <Box flexDirection="column">
      <Static items={[{ id: "cli-agent-header" }]}>
        {() => (
          <Box key="cli-agent-header" flexDirection="column">
            <Text bold>Cli Agent</Text>
            <Hr />
          </Box>
        )}
      </Static>
    </Box>
  );
};
