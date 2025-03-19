package handlers

import (
	"RTF/internal/models"
	"encoding/json"
	"net/http"
	"strconv"
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
