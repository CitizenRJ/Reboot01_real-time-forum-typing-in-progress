package websocket

import (
	"RTF/internal/database"
	"encoding/json"
	"sync"
	"time"

	gorillaWs "github.com/gorilla/websocket"
)

const (
	writeWait = 10 * time.Second

	pongWait = 60 * time.Second

	pingPeriod = (pongWait * 9) / 10

	maxMessageSize = 10000
)

type Client struct {
	conn   *gorillaWs.Conn
	send   chan []byte
	userID int
}

var clientsMutex sync.Mutex
var onlineUsersMutex sync.Mutex
var clients = make(map[*Client]bool)
var broadcast = make(chan Message)
var onlineUsers = make(map[int]bool)

func GetOnlineUsers() []int {
	onlineUsersMutex.Lock()
	defer onlineUsersMutex.Unlock()

	var users []int
	for userID := range onlineUsers {
		users = append(users, userID)
	}
	return users
}

func HandleConnections(conn *gorillaWs.Conn, userID int) {
	DisconnectUser(userID)

	client := &Client{
		conn:   conn,
		send:   make(chan []byte, 256),
		userID: userID,
	}

	clientsMutex.Lock()
	clients[client] = true
	clientsMutex.Unlock()

	onlineUsersMutex.Lock()
	onlineUsers[userID] = true
	onlineUsersMutex.Unlock()

	go client.readPump()
	go client.writePump()

	broadcast <- Message{
		Type:      "user_online",
		Content:   userID,
		Timestamp: time.Now(),
	}
}

func (c *Client) readPump() {
	defer func() {
		c.conn.Close()

		clientsMutex.Lock()
		delete(clients, c)
		clientsMutex.Unlock()

		onlineUsersMutex.Lock()
		delete(onlineUsers, c.userID)
		onlineUsersMutex.Unlock()

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
			}
			break
		}

		var wsMessage Message
		if err := json.Unmarshal(msg, &wsMessage); err != nil {
			continue
		}

		wsMessage.Sender = c.userID
		wsMessage.Timestamp = time.Now()

		switch wsMessage.Type {
		case "chat_message":
			handleChatMessage(wsMessage)
		}
	}
}

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

func handleChatMessage(message Message) {
	if content, ok := message.Content.(map[string]interface{}); ok {
		if receiverID, ok := content["receiverId"].(float64); ok {
			if messageContent, ok := content["content"].(string); ok {
				_, err := database.DB.Exec(
					"INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)",
					message.Sender, int(receiverID), messageContent,
				)
				if err != nil {
				}
			}
		}
	}

	Broadcast(message)
}

func DisconnectUser(userID int) {
	clientsMutex.Lock()
	defer clientsMutex.Unlock()

	for client := range clients {
		if client.userID == userID {
			client.conn.Close()
			delete(clients, client)
			onlineUsersMutex.Lock()
			delete(onlineUsers, userID)
			onlineUsersMutex.Unlock()
			break
		}
	}
}
