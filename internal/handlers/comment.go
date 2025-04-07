package handlers

import (
	"RTF/internal/models"
	"RTF/internal/websocket"
	"encoding/json"
	"net/http"
	"strconv"
)

func HandleComments(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	_, err = models.GetUserBySessionID(cookie.Value)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	switch r.Method {
	case "POST":
		var comment models.Comment
		err = json.NewDecoder(r.Body).Decode(&comment)
		if err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		user, err := models.GetUserBySessionID(cookie.Value)
		if err != nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		comment.UserID = user.ID

		commentID, err := models.CreateComment(comment)
		if err != nil {
			http.Error(w, "Failed to create comment", http.StatusInternalServerError)
			return
		}

		post, err := models.GetPostByID(comment.PostID)
		if err != nil {
			http.Error(w, "Failed to get post", http.StatusInternalServerError)
			return
		}

		comment.ID = commentID
		comment.Username = user.Nickname

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
	case "GET":
		userIDStr := r.URL.Query().Get("userId")
		if userIDStr == "" {
			http.Error(w, "Missing userID parameter", http.StatusBadRequest)
			return
		}

		userID, err := strconv.Atoi(userIDStr)
		if err != nil {
			http.Error(w, "Invalid userID", http.StatusBadRequest)
			return
		}

		comments, err := models.GetCommentsByUserID(userID)
		if err != nil {
			http.Error(w, "Failed to get comments", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"comments": comments,
		})
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
