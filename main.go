/*
Copyright © 2025 Md Sifatul Islam Rabbi <sifatulrabbii@gmail.com>
*/
package main

import (
	"log"
	"os"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/joho/godotenv"

	"github.com/sifatulrabbi/cli-agent/cmd"
	"github.com/sifatulrabbi/cli-agent/internals/utils"
)

func main() {
	devMode := true

	err := godotenv.Load()
	if err != nil {
		if os.Getenv("OPENAI_API_KEY") != "" {
			devMode = false
		} else {
			log.Fatal("Error loading .env file", err)
		}
	}

	f, err := tea.LogToFile(utils.Ternary(devMode, "./tmp/logs/debug.log", "/tmp/cli-agent/debug.log"), "")
	if err != nil {
		log.Panicln("Failed to open log file:", err)
	}
	defer f.Close()
	log.SetOutput(f)

	cmd.Execute()
}
