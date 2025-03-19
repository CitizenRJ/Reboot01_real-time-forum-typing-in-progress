package main

import (
	"RTF/internal/database"
	"RTF/internal/handlers"
	"RTF/internal/websocket"
	"log"
	"net/http"
)

func main() {
	// Initialize database
	err := database.Initialize("./database.db")
	if err != nil {
		log.Fatal("Failed to initialize database:", err)
	}

	// Initialize WebSocket hub
	websocket.Initialize()

	// Set up HTTP routes
	http.HandleFunc("/api/register", handlers.Register)
	http.HandleFunc("/api/login", handlers.Login)
	http.HandleFunc("/api/logout", handlers.Logout)
	http.HandleFunc("/api/session", handlers.CheckSession)

	http.HandleFunc("/api/posts", handlers.HandlePosts)
	http.HandleFunc("/api/posts/", handlers.HandlePostDetail)
	http.HandleFunc("/api/comments", handlers.HandleComments)

	http.HandleFunc("/api/users", handlers.GetUsers)
	http.HandleFunc("/api/users/online", handlers.GetOnlineUsers)

	http.HandleFunc("/api/messages", handlers.GetMessages)

	// WebSocket endpoint
	http.HandleFunc("/ws", handlers.ServeWs)

	// Serve static files
	http.Handle("/", http.FileServer(http.Dir("./static")))

	// Add these new routes
	http.HandleFunc("/api/users/avatar", handlers.HandleUserAvatar)

	// Start server
	log.Println("Server starting on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
