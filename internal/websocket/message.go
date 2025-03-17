package websocket

import (
	"time"
)

// Message represents a WebSocket message
type Message struct {
	Type      string      `json:"type"`
	Content   interface{} `json:"content,omitempty"`
	Sender    int         `json:"sender,omitempty"`
	Timestamp time.Time   `json:"timestamp,omitempty"`
}
