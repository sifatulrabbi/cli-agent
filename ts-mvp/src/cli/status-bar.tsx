import React from "react";
import { Box, Text } from "ink";

const anim = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

export const StatusBar: React.FC<{
  status: string | null | undefined;
  message?: string | null | undefined;
  error?: string | null | undefined;
}> = ({ status, message, error }) => {
  const [frame, setFrame] = React.useState(0);

  React.useEffect(() => {
    if (!status) return;

    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % anim.length);
    }, 200);
    return () => clearInterval(interval);
  }, [status]);

  return (
    <Box flexShrink={0} paddingLeft={3} paddingRight={3} flexDirection="column">
      {status ? (
        <Text wrap="truncate-end">
          {status} {anim[frame]}
        </Text>
      ) : null}
      {message ? (
        <Text italic color="cyanBright">
          {message}
        </Text>
      ) : null}
      {error ? <Text color="redBright">{error}</Text> : null}
    </Box>
  );
};
