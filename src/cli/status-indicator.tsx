import React from "react";
import { Box, Text } from "ink";

export const StatusIndicator: React.FC<{
  status: string | null | undefined;
}> = ({ status }) => {
  const anim = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const [frame, setFrame] = React.useState(0);

  React.useEffect(() => {
    if (!status) return;

    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % anim.length);
    }, 300);
    return () => clearInterval(interval);
  }, [status]);

  if (!status) return null;

  return (
    <Box height={1} flexShrink={0} paddingLeft={3} paddingRight={3}>
      <Text wrap="truncate-end">
        {status} {anim[frame]}
      </Text>
    </Box>
  );
};
