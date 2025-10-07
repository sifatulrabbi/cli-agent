package configs

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

var (
	WorkingPath       string = ""
	OpenaiAPIKey      string = ""
	OpenRouterAPIKey  string = ""
	OpenRouterBaseURL string = "https://openrouter.ai/api/v1"
	LogFilePath       string = ""
	TodosFile         string = "/tmp/cli-agent/todos"
	DevMode           bool   = true
)

func Prepare() {
	dirPath, err := os.Getwd()
	if err != nil {
		log.Fatalln("ERROR: Unable to get the current working directory.", err)
	}

	WorkingPath = dirPath
	DevMode = os.Getenv("GOENV") == "dev"

	if DevMode {
		err = godotenv.Load()
		if err != nil {
			log.Fatalln("ERROR: No .env file found but is required.")
		}
		WorkingPath = filepath.Join(WorkingPath, "./tmp")

		if _, err = os.ReadDir(WorkingPath); os.IsNotExist(err) {
			if err = os.MkdirAll(WorkingPath, 0o755); err != nil {
				log.Fatalln("ERROR: Unable to prepare the directory './tmp' for dev setup.")
			}
		}
	}

	OpenaiAPIKey = os.Getenv("OPENAI_API_KEY")
	OpenRouterAPIKey = os.Getenv("OPENROUTER_API_KEY")
	LogFilePath = "/tmp/cli-agent/debug.log"

	// Ensure the todo list file exists
	if _, err = os.ReadDir(TodosFile); os.IsNotExist(err) {
		if err = os.MkdirAll(TodosFile, 0o755); err != nil {
			log.Fatalln("ERROR: Unable to prepare the directory '/tmp/cli-agent/todos' for dev setup.")
		}
	}
	TodosFile = filepath.Join(TodosFile, strings.ReplaceAll(strings.ReplaceAll(WorkingPath, "/", "-"), ".", "-")+".json")
	err = os.WriteFile(TodosFile, []byte("[]"), 0o644)
	if err != nil {
		log.Fatalln("Unable to create the todo's file:", err)
	}

	if DevMode {
		fmt.Printf("Starting CLI-Agent from '%s' | logs file '%s' | todo file '%s'",
			WorkingPath, LogFilePath, TodosFile)
		time.Sleep(1 * time.Second)
	}
}
