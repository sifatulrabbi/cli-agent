export async function tryCatch<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; error: null | Error }> {
  try {
    const result = await fn();
    return { result, error: null };
  } catch (error: any) {
    return { result: {} as T, error };
  }
}

export async function timing<T>(
  task: (() => Promise<T>) | Promise<T>,
  name: string,
): Promise<T> {
  const startTime = performance.now();

  let res: any = null;
  if (typeof task === "function") {
    res = await task();
  } else {
    res = await task;
  }

  const endTime = performance.now();
  const elapsedMs = endTime - startTime;

  // Format time with appropriate unit
  let timeStr: string;
  if (elapsedMs < 1000) {
    // Less than 1 second: show in milliseconds
    timeStr = `${Math.round(elapsedMs)}ms`;
  } else if (elapsedMs < 60000) {
    // Less than 1 minute: show in seconds
    const seconds = elapsedMs / 1000;
    timeStr = `${seconds}s`;
  } else {
    // 1 minute or more: show in minutes and seconds
    const totalSeconds = Math.round(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    timeStr = `${minutes}min ${seconds}s`;
  }

  console.log(`>>> [${name}] took ${timeStr} <<<`);

  return res;
}
