package handlers

import (
	"RTF/internal/models"
	"encoding/json"
	"log"
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
		conversations, err := models.GetLastMessageWithEachUser(user.ID)
		if err != nil {
			http.Error(w, "Failed to get conversations", http.StatusInternalServerError)
			return
		}

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

	messages, err := models.GetMessagesBetweenUsers(user.ID, otherUserID, limit, offset)
	if err != nil {
		http.Error(w, "Failed to get messages", http.StatusInternalServerError)
		return
	}

	var messageIDs []int
	for _, msg := range messages {
		if msg.SenderID == otherUserID && !msg.Read {
			messageIDs = append(messageIDs, msg.ID)
		}
	}

	if len(messageIDs) > 0 {
		err = models.MarkMessagesAsRead(messageIDs)
		if err != nil {
			log.Printf("Failed to mark messages as read: %v", err)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"messages": messages,
	})
}
