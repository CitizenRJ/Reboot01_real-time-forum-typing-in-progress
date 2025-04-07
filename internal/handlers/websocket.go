package handlers

import (
	"RTF/internal/models"
	ws "RTF/internal/websocket"
	"log"
	"net/http"

	gorillaWs "github.com/gorilla/websocket"
)

var upgrader = gorillaWs.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func ServeWs(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		log.Printf("Unauthorized WebSocket connection attempt: %v", err)
		http.Error(w, "Unauthorized: No session cookie found", http.StatusUnauthorized)
		return
	}

	user, err := models.GetUserBySessionID(cookie.Value)
	if err != nil {
		log.Printf("Unauthorized WebSocket connection attempt with invalid session: %v", err)
		http.Error(w, "Unauthorized: Invalid session", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Failed to upgrade connection to WebSocket for user %d: %v", user.ID, err)
		http.Error(w, "Could not establish WebSocket connection", http.StatusBadRequest)
		return
	}

	log.Printf("WebSocket connection established for user %d from %s", user.ID, r.RemoteAddr)
	ws.HandleConnections(conn, user.ID)
}
