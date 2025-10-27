package tools

import (
    "os"
    "path/filepath"
    "strings"

    "github.com/sifatulrabbi/cli-agent/internals/configs"
)

func detectGitIgnores() {
    entries, _ := traverseDir(configs.WorkingPath)
    dedup := make(map[string]struct{}, len(ignoreFiles)+len(ignoreDirs))
    for _, v := range ignoreFiles {
        dedup[v] = struct{}{}
    }
    for _, v := range ignoreDirs {
        dedup[v] = struct{}{}
    }
    for _, e := range entries {
        if filepath.Base(e) != ".gitignore" {
            continue
        }

        fullPath := filepath.Join(configs.WorkingPath, e)
        data, rErr := os.ReadFile(fullPath)
        if rErr != nil {
            continue
        }

        lines := safeSplit(string(data))

        for _, raw := range lines {
            s := strings.TrimSpace(raw)
            if _, ok := dedup[s]; ok || s == "" || strings.HasPrefix(s, "#") || strings.HasPrefix(s, "!") {
                continue
            }

            dedup[s] = struct{}{}

            isDir := strings.HasSuffix(s, "/")
            s = strings.TrimPrefix(s, "/")
            s = strings.TrimSuffix(s, "/")
            s = filepath.ToSlash(s)

            if s == "" {
                continue
            }
            if isDir {
                ignoreDirs = append(ignoreDirs, s)
            } else {
                ignoreFiles = append(ignoreFiles, s)
            }
        }
    }
}
