package agent

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/openai/openai-go/v2"
	"github.com/openai/openai-go/v2/shared"
)

// Active project configuration (relative to repo root)
// By default we operate inside testBench/workspace, mirroring the TS tools.
const (
	activeProjectDir = "workspace"
	testingDir       = "testBench"
)

var projectRootDir = filepath.Join(testingDir, activeProjectDir)

var ignorePaths = []string{
	".venv",
	"env",
	".env",
	".git",
	".DS_Store",
	".vscode",
	".idea",
	"node_modules",
	"__pycache__",
	"build",
}

// Tools is the list of OpenAI function tools exposed to the model.
var Tools = []openai.ChatCompletionToolUnionParam{
	openai.ChatCompletionFunctionTool(shared.FunctionDefinitionParam{
		Name:        "list_project_files_and_dirs_tool",
		Description: openai.String("List all files of the project."),
		Parameters: shared.FunctionParameters{
			"type":       "object",
			"properties": map[string]any{},
		},
	}),
	openai.ChatCompletionFunctionTool(shared.FunctionDefinitionParam{
		Name:        "read_files_tool",
		Description: openai.String("Read multiple files in the project. Must provide the full path. (Note: the full path can be obtained by using the list_project_files_and_dirs_tool tool.)"),
		Parameters: shared.FunctionParameters{
			"type": "object",
			"properties": map[string]any{
				"filePaths": map[string]any{
					"type":        "array",
					"description": "The paths of the files to read",
					"items": map[string]any{
						"type": "string",
					},
				},
			},
			"required": []string{"filePaths"},
		},
	}),
	openai.ChatCompletionFunctionTool(shared.FunctionDefinitionParam{
		Name:        "create_entity_tool",
		Description: openai.String("Create an entity either a directory or a file in the project."),
		Parameters: shared.FunctionParameters{
			"type": "object",
			"properties": map[string]any{
				"entityPath": map[string]any{
					"type":        "string",
					"description": "The path of the entity to create",
				},
				"entityType": map[string]any{
					"type":        "string",
					"enum":        []string{"dir", "file"},
					"description": "The type of the entity to create",
				},
				"entityName": map[string]any{
					"type":        "string",
					"description": "The name of the entity to create",
				},
				"content": map[string]any{
					"type":        "string",
					"description": "The content of the entity to create. Note for directories please return empty string.",
				},
			},
			"required": []string{"entityPath", "entityType", "entityName", "content"},
		},
	}),
	openai.ChatCompletionFunctionTool(shared.FunctionDefinitionParam{
		Name:        "remove_entity_tool",
		Description: openai.String("Remove an entity either a directory or a file from the project. Must provide the full path. (Note: the full path can be obtained by using the list_project_files_and_dirs_tool tool.)"),
		Parameters: shared.FunctionParameters{
			"type": "object",
			"properties": map[string]any{
				"entityPath": map[string]any{
					"type":        "string",
					"description": "The path of the entity to remove",
				},
			},
			"required": []string{"entityPath"},
		},
	}),
	openai.ChatCompletionFunctionTool(shared.FunctionDefinitionParam{
		Name:        "insert_into_text_file_tool",
		Description: openai.String("Insert content into a text file in the project. Must provide the full path. (Note: the full path can be obtained by using the list_project_files_and_dirs_tool tool.)"),
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
	}),
	openai.ChatCompletionFunctionTool(shared.FunctionDefinitionParam{
		Name:        "patch_text_file_tool",
		Description: openai.String("Patch a text file by replacing existing line ranges only. Insertion is not supported here; use insert_into_text_file_tool for insertions. Must provide the full path (obtainable via list_project_files_and_dirs_tool)."),
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
	}),
}

// ToolHandlers maps tool name to an executor that returns a string result.
var ToolHandlers = map[string]func(argsJSON string) (string, error){
	"list_project_files_and_dirs_tool": handleListProjectFiles,
	"read_files_tool":                  handleReadFiles,
	"create_entity_tool":               handleCreateEntity,
	"remove_entity_tool":               handleRemoveEntity,
	"insert_into_text_file_tool":       handleInsertIntoTextFile,
	"patch_text_file_tool":             handlePatchTextFile,
}

// ----------------------
// Implementation helpers
// ----------------------

func buildPathFromRootDir(entryPath string) string {
	p := entryPath
	// Normalize any leading workspace prefix
	if strings.HasPrefix(p, "/"+activeProjectDir+"/") {
		p = strings.TrimPrefix(p, "/"+activeProjectDir)
	} else if strings.HasPrefix(p, activeProjectDir+"/") {
		p = strings.TrimPrefix(p, activeProjectDir)
	}
	// Normalize leading slash to make Join behavior predictable
	p = strings.TrimPrefix(p, "/")
	return filepath.Join(projectRootDir, p)
}

func dirIgnored(path string) bool {
	for _, ig := range ignorePaths {
		if strings.Contains(path, string(os.PathSeparator)+ig+string(os.PathSeparator)) ||
			strings.HasSuffix(path, string(os.PathSeparator)+ig) ||
			strings.HasPrefix(filepath.Base(path), ig) {
			return true
		}
	}
	return false
}

func traverseDir(root string) ([]string, error) {
	var entries []string
	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if p == root {
			return nil
		}
		rel, err := filepath.Rel(root, p)
		if err != nil {
			return err
		}
		unixy := "/" + filepath.ToSlash(rel)
		if dirIgnored(p) {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if d.IsDir() {
			entries = append(entries, unixy+"/")
		} else {
			entries = append(entries, unixy)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	sort.Strings(entries)
	return entries, nil
}

func safeSplit(content string) []string {
	// Split by \r\n, \n, or \r while preserving empty lines
	content = strings.ReplaceAll(content, "\r\n", "\n")
	content = strings.ReplaceAll(content, "\r", "\n")
	if content == "" {
		return []string{}
	}
	return strings.Split(content, "\n")
}

func detectEOL(s string) string {
	// Return first newline detected; default to \n
	if strings.Contains(s, "\r\n") {
		return "\r\n"
	}
	if strings.Contains(s, "\r") {
		return "\r"
	}
	return "\n"
}

// ----------------------
// Tool handlers
// ----------------------

func handleListProjectFiles(_ string) (string, error) {
	entries, err := traverseDir(projectRootDir)
	if err != nil {
		return "", err
	}
	var b strings.Builder
	b.WriteString("<project-entries>\n")
	for _, e := range entries {
		b.WriteString(activeProjectDir)
		b.WriteString(e)
		if !strings.HasSuffix(e, "\n") {
			b.WriteString("\n")
		}
	}
	b.WriteString("</project-entries>")
	return b.String(), nil
}

func handleReadFiles(argsJSON string) (string, error) {
	var args struct {
		FilePaths []string `json:"filePaths"`
	}
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return "", err
	}
	if len(args.FilePaths) == 0 {
		return "", errors.New("no file paths provided")
	}
	sections := make([]string, 0, len(args.FilePaths))
	for _, fp := range args.FilePaths {
		full := buildPathFromRootDir(fp)
		data, err := os.ReadFile(full)
		if err != nil {
			sections = append(sections, fmt.Sprintf("The '%s' file does not exist or could not be read.", fp))
			continue
		}
		lines := safeSplit(string(data))
		maxWidth := len(fmt.Sprintf("%d", len(lines)))
		var sb strings.Builder
		sb.WriteString("File: ")
		sb.WriteString(fp)
		sb.WriteString("\n")
		for i, line := range lines {
			num := fmt.Sprintf("%*d", maxWidth, i+1)
			sb.WriteString(num)
			sb.WriteString(" | ")
			sb.WriteString(line)
			if i < len(lines)-1 {
				sb.WriteString("\n")
			}
		}
		sections = append(sections, sb.String())
	}
	return strings.Join(sections, "\n\n"), nil
}

func handleCreateEntity(argsJSON string) (string, error) {
	var args struct {
		EntityPath string `json:"entityPath"`
		EntityType string `json:"entityType"`
		EntityName string `json:"entityName"`
		Content    string `json:"content"`
	}
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return "", err
	}
	// Follow TS behavior: prefer EntityName as the target path; fallback to EntityPath
	target := args.EntityName
	if strings.TrimSpace(target) == "" {
		target = args.EntityPath
	}
	full := buildPathFromRootDir(target)

	// Check existence
	if info, err := os.Stat(full); err == nil {
		if info.IsDir() {
			return fmt.Sprintf("The '%s' directory already exists.", target), nil
		}
		return fmt.Sprintf("The '%s' file already exists.", target), nil
	}

	if args.EntityType == "dir" {
		if err := os.MkdirAll(full, 0o755); err != nil {
			return "", err
		}
	} else {
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			return "", err
		}
		if err := os.WriteFile(full, []byte(args.Content), 0o644); err != nil {
			return "", err
		}
	}

	list, _ := handleListProjectFiles("")
	suffix := "."
	if args.EntityType != "dir" {
		suffix = "with the content."
	}
	return fmt.Sprintf("The '%s' %s has been created%s\n\n%s", target, args.EntityType, suffix, list), nil
}

func handleRemoveEntity(argsJSON string) (string, error) {
	var args struct {
		EntityPath string `json:"entityPath"`
	}
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return "", err
	}
	full := buildPathFromRootDir(args.EntityPath)
	info, err := os.Stat(full)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Sprintf("The '%s' does not exist.", args.EntityPath), nil
		}
		return "", err
	}
	if err := os.RemoveAll(full); err != nil {
		return "", err
	}
	list, _ := handleListProjectFiles("")
	kind := "file"
	if info.IsDir() {
		kind = "directory"
	}
	return fmt.Sprintf("The '%s' %s has been removed.\n\n%s", args.EntityPath, kind, list), nil
}

func handleInsertIntoTextFile(argsJSON string) (string, error) {
	var args struct {
		FilePath string `json:"filePath"`
		Inserts  []struct {
			InsertAfter int    `json:"insertAfter"`
			Content     string `json:"content"`
		} `json:"inserts"`
	}
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return "", err
	}
	full := buildPathFromRootDir(args.FilePath)
	data, err := os.ReadFile(full)
	if err != nil {
		return fmt.Sprintf("The '%s' file does not exist or could not be read.", args.FilePath), nil
	}
	content := string(data)
	eol := detectEOL(content)
	lines := safeSplit(content)

	for _, ins := range args.Inserts {
		newLines := safeSplit(ins.Content)
		if ins.InsertAfter < 0 {
			ins.InsertAfter = 0
		}
		if ins.InsertAfter > len(lines) {
			ins.InsertAfter = len(lines)
		}
		// insert after N => position is N
		left := append([]string{}, lines[:ins.InsertAfter]...)
		right := append([]string{}, lines[ins.InsertAfter:]...)
		lines = append(left, append(newLines, right...)...)
	}

	updated := strings.Join(lines, eol)
	if err := os.WriteFile(full, []byte(updated), 0o644); err != nil {
		return "", err
	}

	// Return updated file
	updatedView, _ := handleReadFiles(fmt.Sprintf(`{"filePaths":[%q]}`, args.FilePath))
	return fmt.Sprintf("Inserted %d line(s) into '%s'.\n\nHere is the updated file:\n\n%s", len(lines), args.FilePath, updatedView), nil
}

func handlePatchTextFile(argsJSON string) (string, error) {
	var args struct {
		FilePath string `json:"filePath"`
		Patches  []struct {
			StartLine int    `json:"startLine"`
			EndLine   int    `json:"endLine"`
			Content   string `json:"content"`
		} `json:"patches"`
	}
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return "", err
	}
	full := buildPathFromRootDir(args.FilePath)
	data, err := os.ReadFile(full)
	if err != nil {
		return fmt.Sprintf("The '%s' file does not exist or could not be read.", args.FilePath), nil
	}
	content := string(data)
	eol := detectEOL(content)
	lines := safeSplit(content)
	last := len(lines)

	// Validate
	var vErrs []string
	for i, p := range args.Patches {
		if p.StartLine < 1 || p.EndLine < 1 || p.StartLine > p.EndLine || p.EndLine > last {
			vErrs = append(vErrs, fmt.Sprintf("Patch %d has invalid line range: startLine=%d, endLine=%d. File has %d lines.", i+1, p.StartLine, p.EndLine, last))
		}
	}
	if len(vErrs) > 0 {
		return "Could not apply patches for '" + args.FilePath + "':\n" + strings.Join(vErrs, "\n"), nil
	}

	// Apply in descending order of startLine
	sort.Slice(args.Patches, func(i, j int) bool { return args.Patches[i].StartLine > args.Patches[j].StartLine })
	for _, p := range args.Patches {
		startIdx := p.StartLine - 1
		var newLines []string
		if p.Content != "" {
			newLines = safeSplit(p.Content)
		}
		lines = append(append([]string{}, lines[:startIdx]...), append(newLines, lines[p.EndLine:]...)...)
	}

	updated := strings.Join(lines, eol)
	if err := os.WriteFile(full, []byte(updated), 0o644); err != nil {
		return "", err
	}

	// Return updated file
	updatedView, _ := handleReadFiles(fmt.Sprintf(`{"filePaths":[%q]}`, args.FilePath))
	return fmt.Sprintf("Applied %d patch(es) to '%s'.\n\nHere is the updated file:\n\n%s", len(args.Patches), args.FilePath, updatedView), nil
}
