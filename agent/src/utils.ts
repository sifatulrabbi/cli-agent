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
  console.log(
    `>>> [${name}] took ${((endTime - startTime) / 1000).toFixed(2)} seconds <<<`,
  );

  return res;
}
