package tools

import (
    "encoding/json"
    "fmt"
    "os"
    "sort"
    "strings"
)

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
        idx := ins.InsertAfter
        if idx > len(lines) {
            idx = len(lines)
        }
        lines = append(lines[:idx], append(newLines, lines[idx:]...)...)
    }

    updated := strings.Join(lines, eol)
    if err := os.WriteFile(full, []byte(updated), 0o644); err != nil {
        return "", err
    }

    // Return updated file
    updatedView, _ := formatFileWithLineNumbers(args.FilePath)
    return fmt.Sprintf("Inserted content into '%s'.\n\nHere is the updated file:\n\n%s", args.FilePath, updatedView), nil
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
    updatedView, _ := formatFileWithLineNumbers(args.FilePath)
    return fmt.Sprintf("Applied %d patch(es) to '%s'.\n\nHere is the updated file:\n\n%s", len(args.Patches), args.FilePath, updatedView), nil
}

// formatFileWithLineNumbers reads a single file and returns it with prefixed line numbers
func formatFileWithLineNumbers(relPath string) (string, error) {
    full := buildPathFromRootDir(relPath)
    data, err := os.ReadFile(full)
    if err != nil {
        return fmt.Sprintf("The '%s' file does not exist or could not be read.", relPath), nil
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
