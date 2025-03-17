package handlers

import (
	"RTF/internal/models"
	"RTF/internal/websocket"
	"encoding/json"
	"net/http"
)

func HandleComments(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
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

	var comment models.Comment
	err = json.NewDecoder(r.Body).Decode(&comment)
	if err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	comment.UserID = user.ID

	commentID, err := models.CreateComment(comment)
	if err != nil {
		http.Error(w, "Failed to create comment", http.StatusInternalServerError)
		return
	}

	// Get the post that was commented on
	post, err := models.GetPostByID(comment.PostID)
	if err != nil {
		http.Error(w, "Failed to get post", http.StatusInternalServerError)
		return
	}

	// Add username to comment
	comment.ID = commentID
	comment.Username = user.Nickname

	// Notify all clients about the new comment
	websocket.Broadcast(websocket.Message{
		Type: "new_comment",
		Content: map[string]interface{}{
			"comment": comment,
			"postId":  post.ID,
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"comment": comment,
	})
}
