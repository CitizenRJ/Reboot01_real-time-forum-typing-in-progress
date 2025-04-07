package handlers

import (
	"RTF/internal/models"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"
	"unicode"
)

var (
	loginAttempts = make(map[string]int)
	loginMutex    sync.Mutex
	maxAttempts   = 5
)

func isValidPassword(password string) (bool, string) {
	if len(password) < 8 {
		return false, "Password must be at least 8 characters long"
	}

	hasUpper := false
	hasLower := false
	hasSpecial := false

	for _, char := range password {
		switch {
		case unicode.IsUpper(char):
			hasUpper = true
		case unicode.IsLower(char):
			hasLower = true
		case unicode.IsPunct(char) || unicode.IsSymbol(char):
			hasSpecial = true
		}
	}

	if !hasUpper {
		return false, "Password must contain at least one uppercase letter"
	}
	if !hasLower {
		return false, "Password must contain at least one lowercase letter"
	}
	if !hasSpecial {
		return false, "Password must contain at least one special character"
	}

	return true, ""
}

func Register(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var user models.User
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Error reading request body", http.StatusBadRequest)
		return
	}

	var tempUser struct {
		models.User
		Password string `json:"password"`
	}

	err = json.Unmarshal(body, &tempUser)
	if err != nil {
		http.Error(w, "Invalid JSON format: "+err.Error(), http.StatusBadRequest)
		return
	}

	user = tempUser.User
	user.Password = tempUser.Password

	if user.Nickname == "" || user.Age <= 0 || user.Gender == "" ||
		user.FirstName == "" || user.LastName == "" || user.Email == "" || user.Password == "" {
		http.Error(w, "All fields are required", http.StatusBadRequest)
		return
	}

	if valid, message := isValidPassword(user.Password); !valid {
		http.Error(w, message, http.StatusBadRequest)
		return
	}

	userID, err := models.CreateUser(user)
	if err != nil {
		http.Error(w, "Failed to create user: "+err.Error(), http.StatusInternalServerError)
		return
	}

	session, err := models.CreateSession(userID)
	if err != nil {
		http.Error(w, "Failed to create session", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    session.ID,
		Path:     "/",
		Expires:  time.Now().Add(24 * time.Hour),
		HttpOnly: true,
	})

	user.ID = userID
	user.Password = ""

	w.Header().Set("Content-Type", "application/json")
	response := map[string]interface{}{"user": user}
	json.NewEncoder(w).Encode(response)
}

func Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var credentials struct {
		Login    string `json:"login"`
		Password string `json:"password"`
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Error reading request body", http.StatusBadRequest)
		return
	}

	err = json.Unmarshal(body, &credentials)
	if err != nil {
		http.Error(w, "Invalid JSON format: "+err.Error(), http.StatusBadRequest)
		return
	}

	loginMutex.Lock()
	ipAddr := r.RemoteAddr
	attempts := loginAttempts[ipAddr]
	if attempts >= maxAttempts {
		loginMutex.Unlock()
		http.Error(w, "Too many failed attempts, please try again later", http.StatusTooManyRequests)
		return
	}
	loginMutex.Unlock()

	user, err := models.AuthenticateUser(credentials.Login, credentials.Password)
	if err != nil {
		loginMutex.Lock()
		loginAttempts[ipAddr]++
		loginMutex.Unlock()
		http.Error(w, "Authentication failed", http.StatusUnauthorized)
		return
	}

	session, err := models.CreateSession(user.ID)
	if err != nil {
		http.Error(w, "Failed to create session", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    session.ID,
		Path:     "/",
		Expires:  time.Now().Add(24 * time.Hour),
		HttpOnly: true,
	})

	w.Header().Set("Content-Type", "application/json")
	response := map[string]interface{}{"user": user}
	json.NewEncoder(w).Encode(response)
}

func Logout(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cookie, err := r.Cookie("session_id")
	if err != nil {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{"message": "Already logged out"})
		return
	}

	if err := models.DeleteSession(cookie.Value); err != nil {
		log.Printf("Error deleting session: %v", err)
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    "",
		Path:     "/",
		Expires:  time.Now().Add(-1 * time.Hour),
		HttpOnly: true,
	})

	w.WriteHeader(http.StatusOK)
	response := map[string]interface{}{"message": "Logged out successfully"}
	json.NewEncoder(w).Encode(response)
}

func CheckSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cookie, err := r.Cookie("session_id")
	if err != nil {
		http.Error(w, "No session found", http.StatusUnauthorized)
		return
	}

	user, err := models.GetUserBySessionID(cookie.Value)
	if err != nil {
		http.Error(w, "Invalid session", http.StatusUnauthorized)
		return
	}

	lastRotation, _ := strconv.ParseInt(r.URL.Query().Get("last_rotation"), 10, 64)
	if lastRotation == 0 || time.Since(time.Unix(lastRotation, 0)) > 12*time.Hour {
		if err := models.DeleteSession(cookie.Value); err != nil {
			log.Printf("Error deleting old session: %v", err)
		}

		newSession, err := models.CreateSession(user.ID)
		if err == nil {
			http.SetCookie(w, &http.Cookie{
				Name:     "session_id",
				Value:    newSession.ID,
				Path:     "/",
				Expires:  time.Now().Add(24 * time.Hour),
				HttpOnly: true,
			})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	response := map[string]interface{}{"user": user}
	json.NewEncoder(w).Encode(response)
}
