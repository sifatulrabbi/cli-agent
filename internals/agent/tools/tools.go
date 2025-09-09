package tools

import (
	"github.com/openai/openai-go/v2"
	"github.com/openai/openai-go/v2/responses"
	"github.com/openai/openai-go/v2/shared"
)

const (
	ToolAppendFile = "append_file"
	ToolPatchFile  = "patch_file"
	ToolGrep       = "grep"
	ToolBash       = "bash"
)

// ToolsAvailable defines the OpenAI function tool specifications used by the agent.
var ToolsAvailable = []responses.ToolUnionParam{
	{
		OfFunction: &responses.FunctionToolParam{
			Name:        ToolAppendFile,
			Description: openai.String("Insert content into a text file in the project. Must provide the full path. (Note: the full path can be obtained by using the 'ls' tool.)"),
			Parameters: shared.FunctionParameters{
				"type": "object",
				"properties": map[string]any{
					"filePath": map[string]any{
						"type":        "string",
						"description": "The path of the file to insert into",
					},
					"inserts": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"insertAfter": map[string]any{
									"type":        "number",
									"description": "The line number after which to insert the content.",
								},
								"content": map[string]any{
									"type":        "string",
									"description": "The content to insert",
								},
							},
							"required": []string{"insertAfter", "content"},
						},
					},
				},
				"required": []string{"filePath", "inserts"},
			},
		},
	},
	{
		OfFunction: &responses.FunctionToolParam{
			Name:        ToolPatchFile,
			Description: openai.String("Patch a text file by replacing existing line ranges only. Insertion is not supported here; use 'append_file' for insertions. Must provide the full path (obtainable via 'ls' tool)."),
			Parameters: shared.FunctionParameters{
				"type": "object",
				"properties": map[string]any{
					"filePath": map[string]any{
						"type":        "string",
						"description": "The path of the file to patch",
					},
					"patches": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"startLine": map[string]any{
									"type":        "number",
									"description": "The start line of the range to replace (1-based)",
								},
								"endLine": map[string]any{
									"type":        "number",
									"description": "The end line of the range to replace (1-based)",
								},
								"content": map[string]any{
									"type":        "string",
									"description": "Replacement content. Use empty string to delete the specified range.",
								},
							},
							"required": []string{"startLine", "endLine", "content"},
						},
					},
				},
				"required": []string{"filePath", "patches"},
			},
		},
	},
	{
		OfFunction: &responses.FunctionToolParam{
			Name:        ToolGrep,
			Description: openai.String("Perform a grep action using the unix grep tool."),
			Parameters: shared.FunctionParameters{
				"type": "object",
				"properties": map[string]any{
					"cmd": map[string]any{
						"type":        "string",
						"description": "The command to run (e.g., grep -R -n 'pattern' .). No need to provide any exclude patterns.",
					},
				},
				"required": []string{"cmd"},
			},
		},
	},
	{
		OfFunction: &responses.FunctionToolParam{
			Name:        ToolBash,
			Description: openai.String("Execute a safe subset of bash commands within WorkingPath for listing, reading, creating, and removing files/dirs. Use relative paths; no pipes/redirects/subshells. For content edits, use append_file or patch_file."),
			Parameters: shared.FunctionParameters{
				"type": "object",
				"properties": map[string]any{
					"cmd": map[string]any{
						"type":        "string",
						"description": "Command with simple arguments (no pipes/redirects). Example: 'grep -R -n TODO .'",
					},
				},
				"required": []string{"cmd"},
			},
		},
	},
}

// BuildToolSpecsForServer converts OpenAI tool schema into a plain JSON form for the Python server.
func BuildToolSpecsForServer() []map[string]any {
	specs := make([]map[string]any, 0, len(ToolsAvailable))
	for _, t := range ToolsAvailable {
		if t.OfFunction == nil {
			continue
		}
		fn := t.OfFunction
		fnSpec := map[string]any{
			"name":       fn.Name,
			"parameters": fn.Parameters,
		}
		if fn.Description.Valid() {
			fnSpec["description"] = fn.Description.Value
		}
		if fn.Strict.Valid() {
			fnSpec["strict"] = fn.Strict.Value
		}

		spec := map[string]any{
			"type":     "function",
			"function": fnSpec,
		}
		specs = append(specs, spec)
	}
	return specs
}
