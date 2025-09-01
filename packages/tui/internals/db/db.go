package db

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

var DBPath = "/tmp/cli-agent.db"

func init() {
	dbPath := os.Getenv("DB_PATH")
	if dbPath != "" {
		DBPath = dbPath
	}
	if err := AutoMigrate(); err != nil {
		log.Fatalln("Failed to migrate the database:", err)
	}
}

// gormDB is the shared GORM connection. Use Get() to open/lazy-init.
var gormDB *gorm.DB

// Get returns a singleton *gorm.DB connected to the SQLite database at DBPath.
// It lazily opens the connection and ensures the parent directory exists.
func Get() (*gorm.DB, error) {
	if gormDB != nil {
		return gormDB, nil
	}

	// Ensure parent directory exists for the DB file path
	if dir := filepath.Dir(DBPath); dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("create db dir: %w", err)
		}
	}

	db, err := gorm.Open(sqlite.Open(DBPath), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("open sqlite db: %w", err)
	}

	// Keep a small pool, SQLite works best with fewer writers
	if sqlDB, err := db.DB(); err == nil {
		sqlDB.SetMaxOpenConns(1)
	}

	gormDB = db
	return gormDB, nil
}

// AutoMigrate is a small helper to migrate any provided models.
func AutoMigrate(models ...any) error {
	db, err := Get()
	if err != nil {
		return err
	}
	return db.AutoMigrate(models...)
}
