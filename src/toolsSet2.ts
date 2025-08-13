import { tool } from "@langchain/core/tools";
import { z } from "zod";

const listAvailableProjectsTool = tool(
  async () => {
    return "";
  },
  {
    name: "list_available_projects_tool",
    description: "List all available projects.",
    schema: z.object({}),
  },
);

const searchWithinProjectTool = tool(
  async ({}: {
    projectId: string;
    queries: string[];
    format: "descriptive" | "concise";
  }) => {
    return "";
  },
  {
    name: "search_within_project_tool",
    description:
      "Search within the project for information and return the results in either descriptive format or concise format.",
    schema: z.object({
      projectId: z.string().describe("The ID of the project to search within"),
      queries: z
        .array(z.string())
        .describe(
          "The queries to search for. This can be a question, a statement, or a request for information.",
        ),
      format: z
        .enum(["descriptive", "concise"])
        .describe(
          "The format to return the results in. Descriptive means the returned result will contain a detailed description of the results, while concise means the returned result will contain a concise summary or yes/no for the queries.",
        ),
    }),
  },
);

const searchWithinLibraryTool = tool(
  async ({}: { queries: string[] }) => {
    return "";
  },
  {
    name: "search_within_library_tool",
    description:
      "Search within the library for information and return the results in either descriptive format or concise format.",
    schema: z.object({
      queries: z
        .array(z.string())
        .describe(
          "The queries to search for. This can be a question, a statement, or a request for information.",
        ),
    }),
  },
);

const searchInternetTool = tool(
  async ({}: { queries: string[] }) => {
    return "";
  },
  {
    name: "search_internet_tool",
    description: "Search the internet for information and return the results.",
    schema: z.object({
      queries: z.array(z.string()).describe("The queries to search for."),
    }),
  },
);

const deepResearchTool = tool(
  async ({}: { query: string }) => {
    return "";
  },
  {
    name: "deep_research_tool",
    description:
      "Deep research on the internet for information and return the results.",
    schema: z.object({
      query: z.string().describe("A descriptive query for the deep research."),
    }),
  },
);

export const toolsSet2 = [
  searchWithinProjectTool,
  searchWithinLibraryTool,
  searchInternetTool,
  deepResearchTool,
  listAvailableProjectsTool,
];
