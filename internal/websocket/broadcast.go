package websocket

import (
	"encoding/json"
	"log"
)

// Broadcast sends a message to all connected clients
func Broadcast(message Message) {
	// Convert message to JSON
	messageJSON, err := json.Marshal(message)
	if err != nil {
		log.Printf("Error marshaling message: %v", err)
		return
	}

	// Send to all clients
	for client := range clients {
		// For chat messages, only send to the sender and recipient
		if message.Type == "chat_message" {
			if content, ok := message.Content.(map[string]interface{}); ok {
				if receiverID, ok := content["receiverId"].(float64); ok {
					if client.userID != message.Sender && client.userID != int(receiverID) {
						continue
					}
				}
			}
		}

		select {
		case client.send <- messageJSON:
		default:
			// Client buffer is full or disconnected
			close(client.send)
			delete(clients, client)
			delete(onlineUsers, client.userID)
		}
	}
}
