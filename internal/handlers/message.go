package handlers

import (
	"RTF/internal/models"
	"RTF/internal/websocket"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

func GetMessages(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cookie, err := r.Cookie("session_id")
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := models.GetUserBySessionID(cookie.Value)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	otherUserID, err := strconv.Atoi(r.URL.Query().Get("user"))
	if err != nil || otherUserID == 0 {
		// If no specific user requested, return the list of conversations
		conversations, err := models.GetLastMessageWithEachUser(user.ID)
		if err != nil {
			http.Error(w, "Failed to get conversations", http.StatusInternalServerError)
			return
		}

		// Get unread counts for each conversation
		unreadCounts, err := models.GetUnreadMessageCount(user.ID)
		if err != nil {
			http.Error(w, "Failed to get unread counts", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"conversations": conversations,
			"unreadCounts":  unreadCounts,
		})
		return
	}

	// Get limit and offset for pagination
	limit := 10
	offset := 0

	limitStr := r.URL.Query().Get("limit")
	if limitStr != "" {
		limit, _ = strconv.Atoi(limitStr)
	}

	offsetStr := r.URL.Query().Get("offset")
	if offsetStr != "" {
		offset, _ = strconv.Atoi(offsetStr)
	}

	// Get messages between users
	messages, err := models.GetMessagesBetweenUsers(user.ID, otherUserID, limit, offset)
	if err != nil {
		http.Error(w, "Failed to get messages", http.StatusInternalServerError)
		return
	}

	// Mark messages as read
	err = models.MarkMessagesAsRead(otherUserID, user.ID)
	if err != nil {
		http.Error(w, "Failed to mark messages as read", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"messages": messages,
	})
}
func HandleImageMessage(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check if user is authenticated
	cookie, err := r.Cookie("session_id")
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := models.GetUserBySessionID(cookie.Value)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse multipart form
	err = r.ParseMultipartForm(10 << 20) // 10 MB max
	if err != nil {
		http.Error(w, "Failed to parse form", http.StatusBadRequest)
		return
	}

	// Get receiver ID
	receiverIDStr := r.FormValue("receiverId")
	receiverID, err := strconv.Atoi(receiverIDStr)
	if err != nil {
		http.Error(w, "Invalid receiver ID", http.StatusBadRequest)
		return
	}

	// Get file from form
	file, handler, err := r.FormFile("image")
	if err != nil {
		http.Error(w, "Failed to get file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Check if file is an image
	contentType := handler.Header.Get("Content-Type")
	if !strings.HasPrefix(contentType, "image/") {
		http.Error(w, "File must be an image", http.StatusBadRequest)
		return
	}

	// Create uploads directory if it doesn't exist
	uploadDir := "./static/uploads/chat"
	if _, err := os.Stat(uploadDir); os.IsNotExist(err) {
		os.MkdirAll(uploadDir, 0755)
	}

	// Generate unique filename
	timestamp := time.Now().UnixNano()
	filename := fmt.Sprintf("%d_%d_%s", user.ID, timestamp, handler.Filename)
	filepath := fmt.Sprintf("%s/%s", uploadDir, filename)

	// Create file
	dst, err := os.Create(filepath)
	if err != nil {
		http.Error(w, "Failed to create file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	// Copy file content
	_, err = io.Copy(dst, file)
	if err != nil {
		http.Error(w, "Failed to save file", http.StatusInternalServerError)
		return
	}

	// Create message in database
	message := models.Message{
		SenderID:   user.ID,
		ReceiverID: receiverID,
		Content:    filename,
		IsImage:    true,
	}

	messageID, err := models.CreateMessage(message)
	if err != nil {
		http.Error(w, "Failed to create message", http.StatusInternalServerError)
		return
	}

	// Get the created message
	createdMessage, err := models.GetMessageByID(messageID)
	if err != nil {
		http.Error(w, "Failed to get created message", http.StatusInternalServerError)
		return
	}

	// Broadcast message via WebSocket
	websocket.Broadcast(websocket.Message{
		Type:    "chat_message",
		Content: createdMessage,
	})

	// Return success response
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": createdMessage,
	})
}
