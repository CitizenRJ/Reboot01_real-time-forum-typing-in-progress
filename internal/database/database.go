package database

import (
	"database/sql"
	"fmt"
	"os"

	_ "github.com/mattn/go-sqlite3"
)

var DB *sql.DB

func Initialize(dbPath string) error {
	var err error

	_, err = os.Stat(dbPath)
	dbExists := !os.IsNotExist(err)

	DB, err = sql.Open("sqlite3", dbPath)
	if err != nil {
		return fmt.Errorf("error opening database: %v", err)
	}

	if err = DB.Ping(); err != nil {
		return fmt.Errorf("error connecting to database: %v", err)
	}

	if !dbExists {
		schemaBytes, err := os.ReadFile("schema.sql")
		if err != nil {
			return fmt.Errorf("error reading schema file: %v", err)
		}

		_, err = DB.Exec(string(schemaBytes))
		if err != nil {
			return fmt.Errorf("error creating database schema: %v", err)
		}

		fmt.Println("Database schema created successfully")
	}

	return nil
}
