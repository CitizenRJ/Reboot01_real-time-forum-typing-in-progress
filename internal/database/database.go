package database

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"

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

	DB.SetMaxOpenConns(25)
	DB.SetMaxIdleConns(5)
	DB.SetConnMaxLifetime(5 * time.Minute)

	if err = DB.Ping(); err != nil {
		return fmt.Errorf("error connecting to database: %v", err)
	}

	go monitorDBConnection(dbPath)

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

func monitorDBConnection(dbPath string) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		if err := DB.Ping(); err != nil {
			log.Printf("Database connection error: %v, attempting to reconnect", err)

			newDB, err := sql.Open("sqlite3", dbPath)
			if err != nil {
				log.Printf("Failed to reconnect to database: %v", err)
				continue
			}

			newDB.SetMaxOpenConns(25)
			newDB.SetMaxIdleConns(5)
			newDB.SetConnMaxLifetime(5 * time.Minute)

			if err = newDB.Ping(); err != nil {
				log.Printf("Failed to ping reconnected database: %v", err)
				newDB.Close()
				continue
			}

			oldDB := DB
			DB = newDB
			oldDB.Close()

			log.Println("Successfully reconnected to database")
		}
	}
}
