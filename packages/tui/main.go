/*
Copyright © 2025 Md Sifatul Islam Rabbi <sifatulrabbii@gmail.com>
*/
package main

import (
	"log"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/sifatulrabbi/tea-play/cmd"
)

func main() {
	f, err := tea.LogToFile("./tmp/logs/debug.log", "")
	if err != nil {
		log.Panicln("Failed to open log file:", err)
	}
	defer f.Close()
	log.SetOutput(f)
	cmd.Execute()
}
