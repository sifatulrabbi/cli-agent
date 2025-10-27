package main

import (
	"fmt"
	"log"
	"runtime"
	"strings"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/sifatulrabbi/cli-agent/cmd"
	"github.com/sifatulrabbi/cli-agent/internals/configs"
)

func main() {
	if osName := runtime.GOOS; strings.HasPrefix(osName, "windows") {
		log.Panicln("Platform windows is not supported. Please use within WSL.")
	}

	configs.Prepare()

	f, err := tea.LogToFile(configs.LogFilePath, "")
	if err != nil {
		log.Panicln("Failed to open log file:", err)
	}
	defer func() {
		if err := f.Close(); err != nil {
			fmt.Println("Failed to properly close the log file.")
		}
	}()
	log.SetOutput(f)

	cmd.Execute()
}
