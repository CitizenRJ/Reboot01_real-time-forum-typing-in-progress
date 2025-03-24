package models

import (
	"RTF/internal/database"
	"database/sql"
	"errors"
	"log"
	"time"

	"github.com/gofrs/uuid"
	"golang.org/x/crypto/bcrypt"
)

type User struct {
	ID        int       `json:"id"`
	Nickname  string    `json:"nickname"`
	Age       int       `json:"age"`
	Gender    string    `json:"gender"`
	FirstName string    `json:"firstName"`
	LastName  string    `json:"lastName"`
	Email     string    `json:"email"`
	Password  string    `json:"-"`
	CreatedAt time.Time `json:"createdAt"`
}

type Session struct {
	ID        string    `json:"id"`
	UserID    int       `json:"userId"`
	CreatedAt time.Time `json:"createdAt"`
}

func CreateUser(user User) (int, error) {
	log.Printf("Creating user: %+v", user)

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(user.Password), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("Password hashing error: %v", err)
		return 0, err
	}

	log.Printf("Executing SQL insert")
	result, err := database.DB.Exec(
		"INSERT INTO users (nickname, age, gender, first_name, last_name, email, password) VALUES (?, ?, ?, ?, ?, ?, ?)",
		user.Nickname, user.Age, user.Gender, user.FirstName, user.LastName, user.Email, string(hashedPassword),
	)
	if err != nil {
		log.Printf("Database insert error: %v", err)
		return 0, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		log.Printf("Error getting last insert ID: %v", err)
		return 0, err
	}

	log.Printf("User created with ID: %d", id)
	return int(id), nil
}
func AuthenticateUser(login, password string) (*User, error) {
	var user User
	var hashedPassword string

	// Try to find user by nickname or email
	err := database.DB.QueryRow(
		"SELECT id, nickname, age, gender, first_name, last_name, email, password FROM users WHERE nickname = ? OR email = ?",
		login, login,
	).Scan(&user.ID, &user.Nickname, &user.Age, &user.Gender, &user.FirstName, &user.LastName, &user.Email, &hashedPassword)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, errors.New("invalid credentials")
		}
		return nil, err
	}

	// Compare password
	err = bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
	if err != nil {
		return nil, errors.New("invalid credentials")
	}

	return &user, nil
}

func CreateSession(userID int) (*Session, error) {
	// First, delete any existing sessions for this user
	_, err := database.DB.Exec("DELETE FROM sessions WHERE user_id = ?", userID)
	if err != nil {
		return nil, err
	}

	// Then create a new session as before
	uuid, err := uuid.NewV4()
	if err != nil {
		return nil, err
	}

	sessionID := uuid.String()
	expiresAt := time.Now().Add(7 * 24 * time.Hour)

	_, err = database.DB.Exec("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
		sessionID, userID, expiresAt)
	if err != nil {
		return nil, err
	}

	return &Session{ID: sessionID, UserID: userID, CreatedAt: time.Now()}, nil
}

func GetUserBySessionID(sessionID string) (User, error) {
	var user User
	var expiresAt *time.Time // Changed to pointer to handle NULL values

	err := database.DB.QueryRow(`
		SELECT u.id, u.nickname, u.age, u.gender, u.first_name, u.last_name, u.email, s.expires_at
		FROM users u
		JOIN sessions s ON u.id = s.user_id
		WHERE s.id = ?
	`, sessionID).Scan(&user.ID, &user.Nickname, &user.Age, &user.Gender, &user.FirstName, &user.LastName, &user.Email, &expiresAt)

	if err != nil {
		return User{}, err
	}

	// Check if the session has expired (only if expiresAt is not NULL)
	if expiresAt != nil && expiresAt.Before(time.Now()) {
		// Delete the expired session
		DeleteSession(sessionID)
		return User{}, errors.New("session expired")
	}

	// Return the user directly since we already have all the user data
	return user, nil
}

// DeleteSession removes a session from the database
func DeleteSession(sessionID string) error {
	_, err := database.DB.Exec("DELETE FROM sessions WHERE id = ?", sessionID)
	return err
}

// GetAllUsers retrieves all users from the database
func GetAllUsers() ([]User, error) {
	rows, err := database.DB.Query("SELECT id, nickname, age, gender, first_name, last_name, email, created_at FROM users")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var user User
		err := rows.Scan(&user.ID, &user.Nickname, &user.Age, &user.Gender, &user.FirstName, &user.LastName, &user.Email, &user.CreatedAt)
		if err != nil {
			return nil, err
		}
		users = append(users, user)
	}

	return users, nil
}

// GetUserByID retrieves a user by their ID
func GetUserByID(id int) (User, error) {
	var user User

	err := database.DB.QueryRow(`
		SELECT id, nickname, age, gender, first_name, last_name, email, created_at 
		FROM users WHERE id = ?
	`, id).Scan(&user.ID, &user.Nickname, &user.Age, &user.Gender, &user.FirstName, &user.LastName, &user.Email, &user.CreatedAt)

	if err != nil {
		return User{}, err
	}

	return user, nil
}

// UpdateUserAvatar updates the avatar filename for a user
func UpdateUserAvatar(userID int, filename string) error {
	_, err := database.DB.Exec(
		"UPDATE users SET avatar = ? WHERE id = ?",
		filename, userID,
	)
	return err
}
