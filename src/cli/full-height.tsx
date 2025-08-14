import React from "react";
import { Box, useStdout } from "ink";

export const FullHeight: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { stdout } = useStdout();
  const getRows = () => stdout?.rows ?? (process.stdout as any)?.rows ?? 24;
  const [rows, setRows] = React.useState(getRows());

  React.useEffect(() => {
    const onResize = () => setRows(getRows());
    stdout?.on("resize", onResize);
    return () => {
      stdout?.off?.("resize", onResize);
    };
  }, [stdout]);

  return (
    <Box flexDirection="column" minHeight={rows - 1}>
      {children}
    </Box>
  );
};
