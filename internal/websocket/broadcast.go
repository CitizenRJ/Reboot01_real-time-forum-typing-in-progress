package websocket

import (
	"encoding/json"
	"fmt"
	"log"
	"time"
)

type Message struct {
	Type      string      `json:"type"`
	Content   interface{} `json:"content,omitempty"`
	Sender    int         `json:"sender,omitempty"`
	Timestamp time.Time   `json:"timestamp,omitempty"`
}

func Initialize() {
	log.Println("Initializing WebSocket broadcast system")
	go func() {
		for message := range broadcast {
			Broadcast(message)
		}
	}()
}

func Broadcast(message Message) {
	messageJSON, err := json.Marshal(message)
	if err != nil {
		log.Printf("Error marshaling message of type '%s': %v", message.Type, err)
		return
	}

	clientsMutex.Lock()
	defer clientsMutex.Unlock()

	sentCount := 0
	failedCount := 0

	for client := range clients {
		if message.Type == "chat_message" {
			content, ok := message.Content.(map[string]interface{})
			if !ok {
				log.Printf("Invalid content format in chat message: %T", message.Content)
				continue
			}

			receiverIDValue, exists := content["receiverId"]
			if !exists {
				log.Printf("Missing receiverId in chat message")
				continue
			}

			var receiverID int
			switch v := receiverIDValue.(type) {
			case float64:
				receiverID = int(v)
			case int:
				receiverID = v
			case string:
				_, err := fmt.Sscanf(v, "%d", &receiverID)
				if err != nil || receiverID == 0 {
					log.Printf("Invalid receiverId format: %v", v)
					continue
				}
			default:
				log.Printf("Invalid receiverId type in chat message: %T", receiverIDValue)
				continue
			}

			if client.userID != message.Sender && client.userID != receiverID {
				continue
			}
		}

		select {
		case client.send <- messageJSON:
			sentCount++
		default:
			log.Printf("Failed to send message to user %d, closing connection", client.userID)
			close(client.send)
			delete(clients, client)

			onlineUsersMutex.Lock()
			delete(onlineUsers, client.userID)
			onlineUsersMutex.Unlock()
			failedCount++
		}
	}

	if message.Type != "ping" {
		log.Printf("Broadcasted message type '%s' to %d clients (%d failed)",
			message.Type, sentCount, failedCount)
	}
}
