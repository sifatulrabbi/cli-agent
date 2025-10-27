package tools

import (
    "encoding/json"
    "errors"
    "fmt"
    "log"
    "os/exec"
    "strings"

    "github.com/sifatulrabbi/cli-agent/internals/configs"
)

func handleGrep(argsJSON string) (string, error) {
    var args struct {
        Cmd string `json:"cmd"`
    }
    if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
        return "", err
    }
    if strings.TrimSpace(args.Cmd) == "" {
        return "", errors.New("no command provided")
    }

    fullCmd := fmt.Sprintf("%s --exclude-dir={%s} --exclude={%s}",
        args.Cmd,
        strings.Join(ignoreDirs, ","),
        strings.Join(ignoreFiles, ","))

    cmd := exec.Command("/bin/sh", "-c", fullCmd)
    cmd.Dir = configs.WorkingPath
    out, err := cmd.CombinedOutput()
    if err != nil {
        log.Println("Grep error:", err)
        // Return raw output even on non-zero exit (e.g., no matches)
        return string(out), nil
    }
    log.Println(string(out))
    return string(out), nil
}

