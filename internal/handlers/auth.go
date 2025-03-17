package handlers

import (
	"RTF/internal/models"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"time"
	"unicode"
)

// Add this function for password validation
func isValidPassword(password string) (bool, string) {
	// Check minimum length
	if len(password) < 8 {
		return false, "Password must be at least 8 characters long"
	}

	// Check for uppercase letters
	hasUpper := false
	// Check for lowercase letters
	hasLower := false
	// Check for special characters
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
	log.Printf("Register handler called with method: %s", r.Method)
	if r.Method != "POST" {
		log.Printf("Method not allowed: %s", r.Method)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var user models.User
	body, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("Error reading request body: %v", err)
		http.Error(w, "Error reading request body", http.StatusBadRequest)
		return
	}
	log.Printf("Request body: %s", string(body))

	// Create a temporary struct with password field for unmarshaling
	var tempUser struct {
		models.User
		Password string `json:"password"`
	}

	err = json.Unmarshal(body, &tempUser)
	if err != nil {
		log.Printf("Error unmarshaling JSON: %v", err)
		http.Error(w, "Invalid JSON format: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Copy fields from tempUser to user
	user = tempUser.User
	user.Password = tempUser.Password

	log.Printf("Parsed user: %+v", user)

	// Validate user data
	if user.Nickname == "" || user.Age <= 0 || user.Gender == "" ||
		user.FirstName == "" || user.LastName == "" || user.Email == "" || user.Password == "" {
		log.Printf("Validation error: Missing required fields in user: %+v", user)
		http.Error(w, "All fields are required", http.StatusBadRequest)
		return
	}

	// Validate password complexity
	if valid, message := isValidPassword(user.Password); !valid {
		log.Printf("Password validation failed: %s", message)
		http.Error(w, message, http.StatusBadRequest)
		return
	}

	log.Printf("Validation passed")

	// Try to create the user
	userID, err := models.CreateUser(user)
	if err != nil {
		log.Printf("User creation error: %v", err)
		http.Error(w, "Failed to create user: "+err.Error(), http.StatusInternalServerError)
		return
	}
	log.Printf("User created with ID: %d", userID)

	// Create a session for the new user
	session, err := models.CreateSession(userID)
	if err != nil {
		log.Printf("Session creation error: %v", err)
		http.Error(w, "Failed to create session", http.StatusInternalServerError)
		return
	}
	log.Printf("Session created: %s", session.ID)

	// Set session cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    session.ID,
		Path:     "/",
		Expires:  time.Now().Add(24 * time.Hour),
		HttpOnly: true,
	})
	log.Printf("Session cookie set")

	// Return user data
	user.ID = userID
	user.Password = "" // Don't send password back

	w.Header().Set("Content-Type", "application/json")
	response := map[string]interface{}{"user": user}
	responseJSON, err := json.Marshal(response)
	if err != nil {
		log.Printf("Error marshaling response: %v", err)
		http.Error(w, "Error creating response", http.StatusInternalServerError)
		return
	}
	log.Printf("Sending response: %s", string(responseJSON))
	json.NewEncoder(w).Encode(response)
}

func Login(w http.ResponseWriter, r *http.Request) {
	log.Printf("Login handler called with method: %s", r.Method)
	if r.Method != "POST" {
		log.Printf("Method not allowed: %s", r.Method)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var credentials struct {
		Login    string `json:"login"` // Can be nickname or email
		Password string `json:"password"`
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("Error reading request body: %v", err)
		http.Error(w, "Error reading request body", http.StatusBadRequest)
		return
	}
	log.Printf("Request body: %s", string(body))

	err = json.Unmarshal(body, &credentials)
	if err != nil {
		log.Printf("Error unmarshaling JSON: %v", err)
		http.Error(w, "Invalid JSON format: "+err.Error(), http.StatusBadRequest)
		return
	}
	log.Printf("Login attempt for: %s", credentials.Login)

	user, err := models.AuthenticateUser(credentials.Login, credentials.Password)
	if err != nil {
		log.Printf("Authentication failed for %s: %v", credentials.Login, err)
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}
	log.Printf("User authenticated: %s (ID: %d)", user.Nickname, user.ID)

	// Create a session
	session, err := models.CreateSession(user.ID)
	if err != nil {
		log.Printf("Session creation error: %v", err)
		http.Error(w, "Failed to create session", http.StatusInternalServerError)
		return
	}
	log.Printf("Session created: %s", session.ID)

	// Set session cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    session.ID,
		Path:     "/",
		Expires:  time.Now().Add(24 * time.Hour),
		HttpOnly: true,
	})
	log.Printf("Session cookie set")

	w.Header().Set("Content-Type", "application/json")
	response := map[string]interface{}{"user": user}
	responseJSON, err := json.Marshal(response)
	if err != nil {
		log.Printf("Error marshaling response: %v", err)
		http.Error(w, "Error creating response", http.StatusInternalServerError)
		return
	}
	log.Printf("Sending response: %s", string(responseJSON))
	json.NewEncoder(w).Encode(response)
}

func Logout(w http.ResponseWriter, r *http.Request) {
	log.Printf("Logout handler called with method: %s", r.Method)
	if r.Method != "POST" {
		log.Printf("Method not allowed: %s", r.Method)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cookie, err := r.Cookie("session_id")
	if err != nil {
		log.Printf("No session cookie found: %v", err)
		http.Error(w, "No session found", http.StatusBadRequest)
		return
	}
	log.Printf("Found session cookie: %s", cookie.Value)

	// Delete session from database
	err = models.DeleteSession(cookie.Value)
	if err != nil {
		log.Printf("Failed to delete session %s: %v", cookie.Value, err)
		http.Error(w, "Failed to delete session", http.StatusInternalServerError)
		return
	}
	log.Printf("Session deleted: %s", cookie.Value)

	// Clear cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    "",
		Path:     "/",
		Expires:  time.Now().Add(-1 * time.Hour),
		HttpOnly: true,
	})
	log.Printf("Session cookie cleared")

	w.WriteHeader(http.StatusOK)
	response := map[string]interface{}{"message": "Logged out successfully"}
	responseJSON, err := json.Marshal(response)
	if err != nil {
		log.Printf("Error marshaling response: %v", err)
		http.Error(w, "Error creating response", http.StatusInternalServerError)
		return
	}
	log.Printf("Sending response: %s", string(responseJSON))
	json.NewEncoder(w).Encode(response)
}

func CheckSession(w http.ResponseWriter, r *http.Request) {
	log.Printf("CheckSession handler called with method: %s", r.Method)
	if r.Method != "GET" {
		log.Printf("Method not allowed: %s", r.Method)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cookie, err := r.Cookie("session_id")
	if err != nil {
		log.Printf("No session cookie found: %v", err)
		http.Error(w, "No session found", http.StatusUnauthorized)
		return
	}
	log.Printf("Found session cookie: %s", cookie.Value)

	user, err := models.GetUserBySessionID(cookie.Value)
	if err != nil {
		log.Printf("Invalid session %s: %v", cookie.Value, err)
		http.Error(w, "Invalid session", http.StatusUnauthorized)
		return
	}
	log.Printf("User found for session: %s (ID: %d)", user.Nickname, user.ID)

	w.Header().Set("Content-Type", "application/json")
	response := map[string]interface{}{"user": user}
	responseJSON, err := json.Marshal(response)
	if err != nil {
		log.Printf("Error marshaling response: %v", err)
		http.Error(w, "Error creating response", http.StatusInternalServerError)
		return
	}
	log.Printf("Sending response: %s", string(responseJSON))
	json.NewEncoder(w).Encode(response)
}
