package websocket

import (
	"RTF/internal/database"
	"encoding/json"
	"log"
	"sync"
	"time"

	gorillaWs "github.com/gorilla/websocket"
)

const (
	// Time allowed to write a message to the peer
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer
	pongWait = 60 * time.Second

	// Send pings to peer with this period
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed
	maxMessageSize = 10000
)

// Client represents a single websocket connection
type Client struct {
	conn   *gorillaWs.Conn
	send   chan []byte
	userID int
}

// Add mutexes to protect the maps
var clientsMutex sync.Mutex
var onlineUsersMutex sync.Mutex

// Map of all connected clients
var clients = make(map[*Client]bool)

// Channel for broadcasting messages
var broadcast = make(chan Message)

// Map to track online users
var onlineUsers = make(map[int]bool)

// GetOnlineUsers returns a list of online user IDs
func GetOnlineUsers() []int {
	onlineUsersMutex.Lock()
	defer onlineUsersMutex.Unlock()

	var users []int
	for userID := range onlineUsers {
		users = append(users, userID)
	}
	return users
}

// HandleConnections manages WebSocket connections
func HandleConnections(conn *gorillaWs.Conn, userID int) {
	// Disconnect any existing connection for this user
	DisconnectUser(userID)

	// Create a new client
	client := &Client{
		conn:   conn,
		send:   make(chan []byte, 256),
		userID: userID,
	}

	// Register this client with mutex protection
	clientsMutex.Lock()
	clients[client] = true
	clientsMutex.Unlock()

	onlineUsersMutex.Lock()
	onlineUsers[userID] = true
	onlineUsersMutex.Unlock()

	// Start goroutines for reading and writing
	go client.readPump()
	go client.writePump()

	// Broadcast user online status
	broadcast <- Message{
		Type:      "user_online",
		Content:   userID,
		Timestamp: time.Now(),
	}
}

// readPump pumps messages from the WebSocket connection to the hub
func (c *Client) readPump() {
	defer func() {
		// Clean up on disconnect with mutex protection
		c.conn.Close()

		clientsMutex.Lock()
		delete(clients, c)
		clientsMutex.Unlock()

		onlineUsersMutex.Lock()
		delete(onlineUsers, c.userID)
		onlineUsersMutex.Unlock()

		// Broadcast user offline status
		Broadcast(Message{
			Type: "user_offline",
			Content: map[string]interface{}{
				"userId": c.userID,
			},
		})
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, msg, err := c.conn.ReadMessage()
		if err != nil {
			if gorillaWs.IsUnexpectedCloseError(err, gorillaWs.CloseGoingAway, gorillaWs.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}

		// Parse the received message
		var wsMessage Message
		if err := json.Unmarshal(msg, &wsMessage); err != nil {
			log.Printf("error unmarshaling message: %v", err)
			continue
		}

		// Add sender info and timestamp
		wsMessage.Sender = c.userID
		wsMessage.Timestamp = time.Now()

		// Handle message based on type
		switch wsMessage.Type {
		case "chat_message":
			// Process and save the message
			handleChatMessage(wsMessage)
		}
	}
}

// writePump pumps messages from the hub to the WebSocket connection
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// The hub closed the channel
				c.conn.WriteMessage(gorillaWs.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(gorillaWs.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(gorillaWs.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// handleChatMessage processes and saves chat messages to the database
func handleChatMessage(message Message) {
	// Extract message content
	if content, ok := message.Content.(map[string]interface{}); ok {
		if receiverID, ok := content["receiverId"].(float64); ok {
			if messageContent, ok := content["content"].(string); ok {
				// Insert message directly into database without using is_image field
				_, err := database.DB.Exec(
					"INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)",
					message.Sender, int(receiverID), messageContent,
				)
				if err != nil {
					log.Printf("Error saving message to database: %v", err)
				}
			}
		}
	}

	// Broadcast the message to clients
	Broadcast(message)
}

// Add this to the websocket package
func DisconnectUser(userID int) {
	clientsMutex.Lock()
	defer clientsMutex.Unlock()

	for client := range clients {
		if client.userID == userID {
			// Close the connection
			client.conn.Close()
			// Remove from clients map
			delete(clients, client)

			// Remove from online users if no other connections exist
			onlineUsersMutex.Lock()
			delete(onlineUsers, userID)
			onlineUsersMutex.Unlock()
			break
		}
	}
}
