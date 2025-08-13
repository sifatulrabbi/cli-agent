export async function tryCatch<T>(
  fn: Promise<T> | (() => Promise<T>),
): Promise<{ data: T | null; error: Error | unknown | null }> {
  try {
    const res = await (typeof fn === "function" ? fn() : fn);
    return { data: res, error: null };
  } catch (error) {
    return { data: null, error };
  }
}
