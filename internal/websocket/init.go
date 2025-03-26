package websocket

func Initialize() {
	go func() {
		for message := range broadcast {
			Broadcast(message)
		}
	}()
}
