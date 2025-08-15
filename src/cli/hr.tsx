import React from "react";
import { Box, Text, useStdout } from "ink";

export const Hr: React.FC<{ char?: string; color?: string }> = ({
  char = "─",
  color,
}) => {
  const { stdout } = useStdout();
  const getCols = () => stdout?.columns ?? process.stdout.columns ?? 80;
  const [cols, setCols] = React.useState(getCols());

  React.useEffect(() => {
    const onResize = () => setCols(getCols());
    stdout?.on("resize", onResize);
    return () => {
      stdout?.off?.("resize", onResize);
    };
  }, [stdout]);

  return (
    <Box>
      <Text color={color}>{char.repeat(Math.max(0, cols))}</Text>
    </Box>
  );
};
