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

	// Check if the database file exists
	_, err = os.Stat(dbPath)
	dbExists := !os.IsNotExist(err)

	// Open the database
	DB, err = sql.Open("sqlite3", dbPath)
	if err != nil {
		return fmt.Errorf("error opening database: %v", err)
	}

	// Test the connection
	if err = DB.Ping(); err != nil {
		return fmt.Errorf("error connecting to database: %v", err)
	}

	// If the database didn't exist, create the schema
	if !dbExists {
		// Read the schema SQL file
		schemaBytes, err := os.ReadFile("schema.sql")
		if err != nil {
			return fmt.Errorf("error reading schema file: %v", err)
		}

		// Execute the schema SQL
		_, err = DB.Exec(string(schemaBytes))
		if err != nil {
			return fmt.Errorf("error creating database schema: %v", err)
		}

		fmt.Println("Database schema created successfully")
	}

	return nil
}
