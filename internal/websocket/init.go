package websocket

// Initialize starts the WebSocket hub
func Initialize() {
	// Start the hub process
	go func() {
		for message := range broadcast {
			Broadcast(message)
		}
	}()
}
