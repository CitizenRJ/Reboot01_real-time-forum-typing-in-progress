package websocket

// Initialize starts the WebSocket hub
func Initialize() {
	// Start the hub process
	go func() {
		for {
			select {
			case message := <-broadcast:
				Broadcast(message)
			}
		}
	}()
}
