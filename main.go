package main

import (
	"RTF/internal/database"
	"RTF/internal/handlers"
	"RTF/internal/websocket"
	"log"
	"net/http"
	"path/filepath"
)

func main() {
	// Initialize database
	err := database.Initialize("./forum.db")
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// Initialize WebSocket broadcast system
	websocket.Initialize()

	// Set up static file server
	fs := http.FileServer(http.Dir("static"))

	// Handle static file routes
	http.Handle("/static/", http.StripPrefix("/static/", fs))

	// Register API routes
	http.HandleFunc("/api/register", handlers.Register)
	http.HandleFunc("/api/login", handlers.Login)
	http.HandleFunc("/api/logout", handlers.Logout)
	http.HandleFunc("/api/session", handlers.CheckSession)
	http.HandleFunc("/api/posts", handlers.HandlePosts)
	http.HandleFunc("/api/posts/", handlers.HandlePostDetail)
	http.HandleFunc("/api/comments", handlers.HandleComments)
	http.HandleFunc("/api/users", handlers.GetUsers)
	http.HandleFunc("/api/users/online", handlers.GetOnlineUsers)
	http.HandleFunc("/api/users/avatar", handlers.HandleUserAvatar)
	http.HandleFunc("/api/messages", handlers.GetMessages)

	// WebSocket endpoint
	http.HandleFunc("/ws", handlers.ServeWs)

	// Serve index.html for all other routes
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" && !isStaticRequest(r.URL.Path) {
			http.ServeFile(w, r, filepath.Join("static", "index.html"))
			return
		}
		http.ServeFile(w, r, filepath.Join("static", "index.html"))
	})

	// Start server
	log.Println("Server starting on :http://localhost:8080...")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

// Helper function to check if a request is for static assets
func isStaticRequest(path string) bool {
	staticPaths := []string{"/static/", "/uploads/", "/favicon.ico"}
	for _, prefix := range staticPaths {
		if len(path) >= len(prefix) && path[:len(prefix)] == prefix {
			return true
		}
	}
	return false
}
