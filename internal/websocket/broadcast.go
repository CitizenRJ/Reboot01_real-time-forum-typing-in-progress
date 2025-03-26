package websocket

import (
	"encoding/json"
)

func Broadcast(message Message) {
	messageJSON, err := json.Marshal(message)
	if err != nil {
		return
	}

	clientsMutex.Lock()
	defer clientsMutex.Unlock()

	for client := range clients {
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
			close(client.send)
			delete(clients, client)

			onlineUsersMutex.Lock()
			delete(onlineUsers, client.userID)
			onlineUsersMutex.Unlock()
		}
	}
}
