package tools

import (
    "io/fs"
    "os"
    "path/filepath"
    "sort"
    "strings"

    "github.com/sifatulrabbi/cli-agent/internals/configs"
)

var (
    projectRootName string
    ignoreDirs      = []string{
        "\\.venv",
        "env",
        "\\.env",
        "\\.env",
        "\\.git",
        "\\.vscode",
        ".idea",
        "node_modules",
        "__pycache__",
        "build",
        "dist",
        "\\.cache",
        "\\.tmp",
        "tmp",
    }
    ignoreFiles = []string{
        "\\.DS_Store",
        "\\.env",
        "*.env.*",
        "*.log",
        "*.db",
        "*.sqlite",
        "*.egg",
        "*.egg-info",
        "*.pyc",
        "*.ignore.*",
    }
)

func init() {
    cwd, err := os.Getwd()
    if err != nil || cwd == "" {
        cwd = "/tmp"
    }
    _ = cwd // silence linters; cwd is currently unused
    // Best-effort derive project root name from WorkingPath for path normalization
    projectRootName = filepath.Base(configs.WorkingPath)
    detectGitIgnores()
}

func buildPathFromRootDir(entryPath string) string {
    // Normalize slashes for safe prefix checks, then convert back
    p := filepath.ToSlash(entryPath)
    // Normalize any leading root prefix (with or without starting slash)
    if strings.HasPrefix(p, "/"+projectRootName+"/") {
        p = strings.TrimPrefix(p, "/"+projectRootName+"/")
    } else if strings.HasPrefix(p, projectRootName+"/") {
        p = strings.TrimPrefix(p, projectRootName+"/")
    }
    // Normalize leading slash to make Join behavior predictable
    p = strings.TrimPrefix(p, "/")
    // Convert back to OS-specific separators for joining
    p = filepath.FromSlash(p)
    return filepath.Join(configs.WorkingPath, p)
}

func dirIgnored(path string) bool {
    for _, ig := range ignoreDirs {
        ig = strings.ReplaceAll(ig, "\\", "")
        if strings.Contains(path, string(os.PathSeparator)+ig+string(os.PathSeparator)) ||
            strings.HasSuffix(path, string(os.PathSeparator)+ig) ||
            strings.HasPrefix(filepath.Base(path), ig) {
            return true
        }
    }
    for _, ig := range ignoreFiles {
        ig = strings.ReplaceAll(ig, "\\", "")
        if strings.HasPrefix(filepath.Base(path), ig) {
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
        unixy := "./" + filepath.ToSlash(rel)
        if dirIgnored(rel) {
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
