package websocket

import (
	"RTF/internal/database"
	"RTF/internal/models"
	"encoding/json"
	"fmt"
	"log"
	"strings"
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
	if conn == nil {
		log.Printf("Error: Attempting to handle connection with nil WebSocket for user %d", userID)
		return
	}

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

	log.Printf("User %d connected. Total connected clients: %d", userID, len(clients))

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
		if r := recover(); r != nil {
			log.Printf("Recovered from panic in readPump for user %d: %v", c.userID, r)
		}

		if err := c.conn.Close(); err != nil {
			log.Printf("Error closing connection for user %d: %v", c.userID, err)
		}

		clientsMutex.Lock()
		delete(clients, c)
		clientsMutex.Unlock()

		onlineUsersMutex.Lock()
		delete(onlineUsers, c.userID)
		onlineUsersMutex.Unlock()

		log.Printf("User %d disconnected. Remaining connected clients: %d", c.userID, len(clients))

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
		err := c.conn.SetReadDeadline(time.Now().Add(pongWait))
		if err != nil {
			log.Printf("Error setting read deadline for user %d: %v", c.userID, err)
		}
		return nil
	})

	for {
		_, msg, err := c.conn.ReadMessage()
		if err != nil {
			if gorillaWs.IsUnexpectedCloseError(err, gorillaWs.CloseGoingAway, gorillaWs.CloseAbnormalClosure) {
				log.Printf("WebSocket read error for user %d: %v", c.userID, err)
			} else {
				log.Printf("Normal connection close for user %d", c.userID)
			}
			break
		}

		var wsMessage Message
		if err := json.Unmarshal(msg, &wsMessage); err != nil {
			log.Printf("Invalid message format from user %d: %v", c.userID, err)
			continue
		}

		wsMessage.Sender = c.userID
		wsMessage.Timestamp = time.Now()

		switch wsMessage.Type {
		case "chat_message":
			if err := handleChatMessage(wsMessage); err != nil {
				log.Printf("Error handling chat message from user %d: %v", c.userID, err)
			}
		case "new_comment":
			if err := handleNewComment(wsMessage); err != nil {
				log.Printf("Error handling new comment from user %d: %v", c.userID, err)
			}
		case "user_online":
			if err := handleUserOnline(wsMessage); err != nil {
				log.Printf("Error handling user online message from user %d: %v", c.userID, err)
			}
		case "user_offline":
			if err := handleUserOffline(wsMessage); err != nil {
				log.Printf("Error handling user offline message from user %d: %v", c.userID, err)
			}
		case "typing_start":
			if err := handleTypingStart(wsMessage); err != nil {
				log.Printf("Error handling typing start from user %d: %v", c.userID, err)
			}
		case "typing_stop":
			if err := handleTypingStop(wsMessage); err != nil {
				log.Printf("Error handling typing stop from user %d: %v", c.userID, err)
			}
		case "ping":
			log.Printf("Received ping from user %d, sending pong", c.userID)
			Broadcast(Message{
				Type:      "pong",
				Sender:    c.userID,
				Timestamp: time.Now(),
			})
		default:
			if strings.ToLower(wsMessage.Type) == "ping" {
				log.Printf("Received ping (alternate format) from user %d, sending pong", c.userID)
				Broadcast(Message{
					Type:      "pong",
					Sender:    c.userID,
					Timestamp: time.Now(),
				})
			} else {
				log.Printf("Unknown message type '%s' from user %d", wsMessage.Type, c.userID)
				Broadcast(wsMessage)
			}
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		if r := recover(); r != nil {
			log.Printf("Recovered from panic in writePump for user %d: %v", c.userID, r)
		}

		ticker.Stop()
		if err := c.conn.Close(); err != nil {
			log.Printf("Error closing connection in writePump for user %d: %v", c.userID, err)
		}
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

func handleChatMessage(message Message) error {
	content, ok := message.Content.(map[string]interface{})
	if !ok {
		return fmt.Errorf("invalid chat message content format: expected map[string]interface{}, got %T", message.Content)
	}

	receiverIDValue, receiverExists := content["receiverId"]
	if !receiverExists {
		return fmt.Errorf("missing receiverId in chat message")
	}

	var receiverID int
	switch v := receiverIDValue.(type) {
	case float64:
		receiverID = int(v)
	case int:
		receiverID = v
	case string:
		var err error
		_, err = fmt.Sscanf(v, "%d", &receiverID)
		if err != nil || receiverID == 0 {
			return fmt.Errorf("invalid receiverId format: %v", v)
		}
	default:
		return fmt.Errorf("invalid receiverId type: %T", receiverIDValue)
	}

	if receiverID <= 0 {
		return fmt.Errorf("invalid receiverId value: %d", receiverID)
	}

	onlineUsersMutex.Lock()
	isReceiverOnline := onlineUsers[receiverID]
	onlineUsersMutex.Unlock()

	if !isReceiverOnline {
		return fmt.Errorf("cannot send message to offline user")
	}

	messageContent, ok := content["content"].(string)
	if !ok {
		return fmt.Errorf("invalid message content format: expected string, got %T", content["content"])
	}

	if messageContent == "" {
		return fmt.Errorf("empty message content")
	}

	_, err := database.DB.Exec(
		"INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)",
		message.Sender, receiverID, messageContent,
	)
	if err != nil {
		return fmt.Errorf("database error saving message: %w", err)
	}

	content["receiverId"] = receiverID
	message.Content = content

	Broadcast(message)
	return nil
}

func handleNewComment(message Message) error {
	content, ok := message.Content.(map[string]interface{})
	if !ok {
		return fmt.Errorf("invalid comment content format: expected map[string]interface{}, got %T", message.Content)
	}

	postIDValue, exists := content["postId"]
	if !exists {
		return fmt.Errorf("missing postId in comment message")
	}

	var postID int
	switch v := postIDValue.(type) {
	case float64:
		postID = int(v)
	case int:
		postID = v
	case string:
		var err error
		_, err = fmt.Sscanf(v, "%d", &postID)
		if err != nil || postID == 0 {
			return fmt.Errorf("invalid postId format: %v", v)
		}
	default:
		return fmt.Errorf("invalid postId type: %T", postIDValue)
	}

	if postID <= 0 {
		return fmt.Errorf("invalid postId value: %d", postID)
	}

	commentContent, ok := content["content"].(string)
	if !ok {
		return fmt.Errorf("invalid comment content format: expected string, got %T", content["content"])
	}

	if commentContent == "" {
		return fmt.Errorf("empty comment content")
	}

	_, err := database.DB.Exec(
		"INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)",
		postID, message.Sender, commentContent,
	)
	if err != nil {
		return fmt.Errorf("database error saving comment: %w", err)
	}

	content["postId"] = postID
	message.Content = content

	Broadcast(message)
	return nil
}

func handleUserOnline(message Message) error {
	var userID int

	switch v := message.Content.(type) {
	case float64:
		userID = int(v)
	case int:
		userID = v
	case map[string]interface{}:
		if idValue, exists := v["userId"]; exists {
			switch id := idValue.(type) {
			case float64:
				userID = int(id)
			case int:
				userID = id
			case string:
				_, err := fmt.Sscanf(id, "%d", &userID)
				if err != nil {
					return fmt.Errorf("invalid userId format in user_online message: %v", id)
				}
			default:
				return fmt.Errorf("invalid userId type in user_online message: %T", idValue)
			}
		} else {
			return fmt.Errorf("missing userId in user_online message content")
		}
	default:
		return fmt.Errorf("invalid user_online message content format: %T", message.Content)
	}

	if userID <= 0 {
		return fmt.Errorf("invalid userId value in user_online message: %d", userID)
	}

	onlineUsersMutex.Lock()
	onlineUsers[userID] = true
	onlineUsersMutex.Unlock()
	log.Printf("User %d is now online", userID)

	Broadcast(message)
	return nil
}

func handleUserOffline(message Message) error {
	var userID int

	switch v := message.Content.(type) {
	case float64:
		userID = int(v)
	case int:
		userID = v
	case map[string]interface{}:
		if idValue, exists := v["userId"]; exists {
			switch id := idValue.(type) {
			case float64:
				userID = int(id)
			case int:
				userID = id
			case string:
				_, err := fmt.Sscanf(id, "%d", &userID)
				if err != nil {
					return fmt.Errorf("invalid userId format in user_offline message: %v", id)
				}
			default:
				return fmt.Errorf("invalid userId type in user_offline message: %T", idValue)
			}
		} else {
			return fmt.Errorf("missing userId in user_offline message content")
		}
	default:
		return fmt.Errorf("invalid user_offline message content format: %T", message.Content)
	}

	if userID <= 0 {
		return fmt.Errorf("invalid userId value in user_offline message: %d", userID)
	}

	onlineUsersMutex.Lock()
	delete(onlineUsers, userID)
	onlineUsersMutex.Unlock()
	log.Printf("User %d is now offline", userID)

	Broadcast(message)
	return nil
}

func handleTypingStart(message Message) error {
	content, ok := message.Content.(map[string]interface{})
	if !ok {
		return fmt.Errorf("invalid typing_start content format: expected map[string]interface{}, got %T", message.Content)
	}

	receiverIDValue, receiverExists := content["receiverId"]
	if !receiverExists {
		return fmt.Errorf("missing receiverId in typing_start message")
	}

	var receiverID int
	switch v := receiverIDValue.(type) {
	case float64:
		receiverID = int(v)
	case int:
		receiverID = v
	case string:
		var err error
		_, err = fmt.Sscanf(v, "%d", &receiverID)
		if err != nil || receiverID == 0 {
			return fmt.Errorf("invalid receiverId format: %v", v)
		}
	default:
		return fmt.Errorf("invalid receiverId type: %T", receiverIDValue)
	}

	if receiverID <= 0 {
		return fmt.Errorf("invalid receiverId value: %d", receiverID)
	}

	// Check if receiver is online
	onlineUsersMutex.Lock()
	isReceiverOnline := onlineUsers[receiverID]
	onlineUsersMutex.Unlock()

	if !isReceiverOnline {
		return fmt.Errorf("receiver is not online")
	}

	var senderName string
	senderUser, err := models.GetUserByID(message.Sender)
	if err == nil {
		senderName = senderUser.Nickname
	} else {
		senderName = fmt.Sprintf("User %d", message.Sender)
	}

	content["senderName"] = senderName
	message.Content = content

	Broadcast(message)
	return nil
}

func handleTypingStop(message Message) error {
	content, ok := message.Content.(map[string]interface{})
	if !ok {
		return fmt.Errorf("invalid typing_stop content format: expected map[string]interface{}, got %T", message.Content)
	}

	receiverIDValue, receiverExists := content["receiverId"]
	if !receiverExists {
		return fmt.Errorf("missing receiverId in typing_stop message")
	}

	var receiverID int
	switch v := receiverIDValue.(type) {
	case float64:
		receiverID = int(v)
	case int:
		receiverID = v
	case string:
		var err error
		_, err = fmt.Sscanf(v, "%d", &receiverID)
		if err != nil || receiverID == 0 {
			return fmt.Errorf("invalid receiverId format: %v", v)
		}
	default:
		return fmt.Errorf("invalid receiverId type: %T", receiverIDValue)
	}

	if receiverID <= 0 {
		return fmt.Errorf("invalid receiverId value: %d", receiverID)
	}

	Broadcast(message)
	return nil
}

func DisconnectUser(userID int) {
	clientsMutex.Lock()
	defer clientsMutex.Unlock()

	var clientToDisconnect *Client
	for client := range clients {
		if client.userID == userID {
			clientToDisconnect = client
			break
		}
	}

	if clientToDisconnect != nil {
		if err := clientToDisconnect.conn.Close(); err != nil {
			log.Printf("Error closing connection for user %d: %v", userID, err)
		}

		delete(clients, clientToDisconnect)

		onlineUsersMutex.Lock()
		delete(onlineUsers, userID)
		onlineUsersMutex.Unlock()

		log.Printf("User %d forcibly disconnected", userID)
	}
}
