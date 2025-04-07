package handlers

import (
	"RTF/internal/models"
	"RTF/internal/websocket"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

func GetUsers(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

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

	users, err := models.GetAllUsers()
	if err != nil {
		http.Error(w, "Failed to get users", http.StatusInternalServerError)
		return
	}

	onlineUserIDs := websocket.GetOnlineUsers()

	onlineMap := make(map[int]bool)
	for _, id := range onlineUserIDs {
		onlineMap[id] = true
	}

	var usersWithStatus []map[string]interface{}
	for _, user := range users {
		userData := map[string]interface{}{
			"id":        user.ID,
			"nickname":  user.Nickname,
			"age":       user.Age,
			"gender":    user.Gender,
			"firstName": user.FirstName,
			"lastName":  user.LastName,
			"email":     user.Email,
			"createdAt": user.CreatedAt,
			"isOnline":  onlineMap[user.ID],
		}
		usersWithStatus = append(usersWithStatus, userData)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"users": usersWithStatus,
	})
}

func GetOnlineUsers(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

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

	onlineUserIDs := websocket.GetOnlineUsers()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"onlineUsers": onlineUserIDs,
	})
}
func HandleUserAvatar(w http.ResponseWriter, r *http.Request) {
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

	err = r.ParseMultipartForm(10 << 20)
	if err != nil {
		http.Error(w, "Failed to parse form", http.StatusBadRequest)
		return
	}

	file, handler, err := r.FormFile("avatar")
	if err != nil {
		http.Error(w, "Failed to get file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	contentType := handler.Header.Get("Content-Type")
	if !strings.HasPrefix(contentType, "image/") {
		http.Error(w, "File must be an image", http.StatusBadRequest)
		return
	}

	uploadDir := "./static/uploads/avatars"
	if _, err := os.Stat(uploadDir); os.IsNotExist(err) {
		os.MkdirAll(uploadDir, 0755)
	}

	filename := fmt.Sprintf("%d_%s", user.ID, handler.Filename)
	filepath := fmt.Sprintf("%s/%s", uploadDir, filename)

	dst, err := os.Create(filepath)
	if err != nil {
		http.Error(w, "Failed to create file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	_, err = io.Copy(dst, file)
	if err != nil {
		http.Error(w, "Failed to save file", http.StatusInternalServerError)
		return
	}

	err = models.UpdateUserAvatar(user.ID, filename)
	if err != nil {
		http.Error(w, "Failed to update user", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"avatar": filename,
	})
}
