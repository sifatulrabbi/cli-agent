package tools

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"slices"
	"strings"
)

type FilePatch struct {
	StartLine int    `json:"startLine"`
	EndLine   int    `json:"endLine"`
	Content   string `json:"content"`
}

type FileInsert struct {
	InsertAfter int    `json:"insertAfter"`
	Content     string `json:"content"`
}

type ReadFile struct {
	FilePath  string `json:"filePath"`
	StartLine int    `json:"startLine"`
	EndLine   int    `json:"endLine"`
}

func handleInsertIntoTextFile(argsJSON string) (string, error) {
	var args struct {
		FilePath string       `json:"filePath"`
		Inserts  []FileInsert `json:"inserts"`
	}
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return "", err
	}

	fullPath := buildPathFromRootDir(args.FilePath)
	data, err := os.ReadFile(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			err = os.WriteFile(fullPath, []byte(""), 0o644)
			if err != nil {
				return "", err
			}
		} else {
			log.Println("ERROR:", err)
			return fmt.Sprintf("Error when working on %q file. Error message: %q", args.FilePath, err), nil
		}
	}

	existingContent := string(data)
	eol := detectEOL(existingContent)
	lines := safeSplit(existingContent)

	// Apply inserts in descending order of target index to avoid shifting subsequent insert positions.
	slices.SortFunc(args.Inserts, func(a, b FileInsert) int { return b.InsertAfter - a.InsertAfter })
	for _, ins := range args.Inserts {
		newLines := safeSplit(ins.Content)
		if ins.InsertAfter < 0 {
			ins.InsertAfter = 0
		}
		idx := min(ins.InsertAfter, len(lines))
		lines = append(lines[:idx], append(newLines, lines[idx:]...)...)
	}
	updated := strings.Join(lines, eol)
	if err := os.WriteFile(fullPath, []byte(updated), 0o644); err != nil {
		return "", err
	}
	return fmt.Sprintf("Inserted content into '%s'.", args.FilePath), nil
}

func handlePatchTextFile(argsJSON string) (string, error) {
	var args struct {
		FilePath string      `json:"filePath"`
		Patches  []FilePatch `json:"patches"`
	}
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return "", err
	}
	full := buildPathFromRootDir(args.FilePath)
	data, err := os.ReadFile(full)
	if err != nil {
		return fmt.Sprintf("The '%s' file does not exists. Here is the error: %q", args.FilePath, err), nil
	}
	existingContent := string(data)
	eol := detectEOL(existingContent)
	lines := safeSplit(existingContent)
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
	slices.SortFunc(args.Patches, func(a, b FilePatch) int { return b.StartLine - a.StartLine })
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
	return fmt.Sprintf("Applied %d patch(es) to '%s'.", len(args.Patches), args.FilePath), nil
}

func handleReadFiles(argsJSON string) (string, error) {
	var args struct {
		Reads []ReadFile `json:"filePaths"`
	}
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return "", err
	}

	if len(args.Reads) < 1 {
		return "The filePaths is empty please specify filePaths to read files.", nil
	}

	out := ""
	for _, p := range args.Reads {
		content, err := formatFileWithLineNumbers(p.FilePath)
		if err != nil {
			out += fmt.Sprintf("Failed to read file: %q\nReason: %s", p, err)
			continue
		}
		if out != "" {
			out += "\n\n"
		}
		lines := safeSplit(content)
		safeStart := p.StartLine - 1
		if p.StartLine > len(lines) || p.StartLine < 0 {
			safeStart = 0
		}
		safeEnd := p.EndLine
		if p.EndLine < 1 || p.EndLine > len(lines) {
			safeEnd = len(lines)
		}
		out += fmt.Sprintf("<file_content name=%q>\n%s\n</file_content>",
			p,
			strings.Join(lines[safeStart:safeEnd], "\n"))
	}
	return out, nil
}

func handleListFiles(argsJSON sting) (string, error) {
	return "", nil
}

// formatFileWithLineNumbers reads a single file and returns it with prefixed line numbers
func formatFileWithLineNumbers(relPath string) (string, error) {
	full := buildPathFromRootDir(relPath)
	data, err := os.ReadFile(full)
	if err != nil {
		return "", err
	}
	lines := safeSplit(string(data))
	maxWidth := len(fmt.Sprintf("%d", len(lines)))
	var sb strings.Builder
	sb.WriteString("File: ")
	sb.WriteString(relPath)
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
	return sb.String(), nil
}
