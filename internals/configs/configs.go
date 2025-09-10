package configs

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/joho/godotenv"

	"github.com/sifatulrabbi/cli-agent/internals/utils"
)

var (
	WorkingPath      string = ""
	OpenaiAPIKey     string = ""
	OpenRouterAPIKey string = ""
	LogFilePath      string = ""
	DevMode          bool   = true
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
			if err = os.WriteFile(filepath.Join(WorkingPath, "./.gitignore"), []byte("logs\n.env"), 0o644); err != nil {
				log.Fatalln("ERROR: Unable to prepare the directory './tmp' for dev setup.")
			}
		}
	}

	OpenaiAPIKey = os.Getenv("OPENAI_API_KEY")
	OpenRouterAPIKey = os.Getenv("OPENROUTER_API_KEY")
	LogFilePath = utils.Ternary(DevMode, "./tmp/logs/debug.log", "/tmp/cli-agent/debug.log")

	if DevMode {
		fmt.Printf("Starting CLI-Agent from '%s' | logs file '%s'", WorkingPath, LogFilePath)
		time.Sleep(1 * time.Second)
	}
}
