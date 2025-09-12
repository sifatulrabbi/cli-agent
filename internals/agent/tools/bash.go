package tools

import (
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/sifatulrabbi/cli-agent/internals/configs"
)

// A conservative bash tool that executes a small, safe subset
// of commands within WorkingPath. It blocks absolute paths, path traversal,
// pipes, redirects, backgrounding, subshells, and env expansion.
func handleBash(argsJSON string) (string, error) {
	var args struct {
		Cmd string `json:"cmd"`
	}
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return "", err
	}
	cmdline := strings.TrimSpace(args.Cmd)
	if cmdline == "" {
		return "", errors.New("no command provided")
	}

	// Disallow potentially dangerous shell features outright.
	// This tool executes without a shell, but we sanitize anyway.
	forbiddenChars := []string{";", "`", "$", ">", "<", "\n", "\r", "(", ")"}
	for _, ch := range forbiddenChars {
		if strings.Contains(cmdline, ch) {
			return "", fmt.Errorf("unsupported character %q in command", ch)
		}
	}

	// Tokenize conservatively by whitespace. Quoting is not supported.
	tokens := strings.Fields(cmdline)
	if len(tokens) == 0 {
		return "", errors.New("empty command")
	}

	cmdName := tokens[0]
	argsList := tokens[1:]

	// Whitelist of allowed commands:
	allowed := map[string]bool{
		"ls": true, "cat": true, "grep": true, "rg": true, "sed": true, "awk": true,
		"find": true, "head": true, "tail": true, "wc": true, "cut": true, "sort": true,
		"uniq": true, "stat": true, "readlink": true, "basename": true, "dirname": true,
		"echo": true, "printf": true, "mkdir": true, "touch": true, "mv": true, "rm": true,
		"rmdir": true, "python3": true, "go": true, "node": true, "npm": true, "pip": true,
		"pnpm": true, "bun": true,
	}
	if !allowed[cmdName] {
		return "", fmt.Errorf("command %q is not allowed", cmdName)
	}

	// Additional guardrails:
	// - Block sed -i (in-place) edits
	if cmdName == "sed" {
		for _, a := range argsList {
			if strings.HasPrefix(a, "-i") {
				return "", errors.New("sed -i is not allowed")
			}
		}
	}
	// - Block find -exec / -ok / -delete
	if cmdName == "find" {
		for _, a := range argsList {
			if a == "-exec" || a == "-ok" || a == "-delete" {
				return "", errors.New("find with -exec/-ok/-delete is not allowed")
			}
		}
	}
	// - Basic guardrails for rm to avoid unexpected long options
	if cmdName == "rm" {
		for _, a := range argsList {
			if strings.HasPrefix(a, "--") {
				return "", errors.New("rm long options are not allowed")
			}
		}
	}

	// Validate path-like arguments: no absolute paths, no .. traversal.
	// Heuristic: treat any token containing '/' or starting with '.' as path-like.
	// Also validate -f/-o style options that may combine with a path (basic): skip options.
	dotdot := regexp.MustCompile(`(^|/)\.\.(?:/|$)`) // contains ../ or /../ boundaries
	for _, t := range argsList {
		if strings.HasPrefix(t, "-") { // flags
			continue
		}
		if strings.HasPrefix(t, "/") {
			return "", fmt.Errorf("absolute paths are not allowed: %q", t)
		}
		if dotdot.MatchString(filepath.ToSlash(t)) {
			return "", fmt.Errorf("path traversal is not allowed: %q", t)
		}
	}

	// Resolve binary and execute without a shell for safety.
	if _, err := exec.LookPath(cmdName); err != nil {
		return "", fmt.Errorf("command not found: %s", cmdName)
	}
	cmd := exec.Command(cmdName, argsList...)
	cmd.Dir = configs.WorkingPath
	out, _ := cmd.CombinedOutput()
	// Return output even on non-zero exit (e.g., grep no match), surface error as text only.
	return string(out), nil
}
