import fs from "fs";

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

const starterContent = [
  {
    lc: 1,
    type: "constructor",
    id: ["langchain_core", "messages", "HumanMessage"],
    kwargs: {
      content:
        "\nBuild me a todo app using React 18 and Tailwind CSS 3. The todo app should have the following features:\n1) add a todo\n2) delete a todo\n3) mark a todo as complete\n4) display the todos in a list.\nStore/load the todos from the localStorage of the browser.\n\nDO NOT ask for me for follow up questions and start building the app immediately.\n",
      additional_kwargs: {},
      response_metadata: {},
      id: "9b1b2617-06a4-4951-a4a2-926eda392c3f",
    },
  },
];

export function ensureHistoryFileExists(historyPath: string) {
  if (!fs.existsSync(historyPath)) {
    fs.writeFileSync(historyPath, JSON.stringify(starterContent, null, 2));
  }
}
