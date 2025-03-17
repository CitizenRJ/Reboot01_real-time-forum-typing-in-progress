package models

import (
	"RTF/internal/database"
	"time"
)

type Message struct {
	ID         int       `json:"id"`
	SenderID   int       `json:"senderId"`
	ReceiverID int       `json:"receiverId"`
	Content    string    `json:"content"`
	CreatedAt  time.Time `json:"createdAt"`
	Read       bool      `json:"read"`
	IsImage    bool      `json:"isImage"`
	SenderName string    `json:"senderName,omitempty"`
}

func CreateMessage(message Message) (int, error) {
	result, err := database.DB.Exec(
		"INSERT INTO messages (sender_id, receiver_id, content, is_image) VALUES (?, ?, ?, ?)",
		message.SenderID, message.ReceiverID, message.Content, message.IsImage,
	)
	if err != nil {
		return 0, err
	}

	id, err := result.LastInsertId()
	return int(id), err
}

func GetMessagesBetweenUsers(userID1, userID2 int, limit, offset int) ([]Message, error) {
	rows, err := database.DB.Query(`
		SELECT m.id, m.sender_id, m.receiver_id, m.content, m.created_at, m.read, u.nickname
		FROM messages m
		JOIN users u ON m.sender_id = u.id
		WHERE (m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)
		ORDER BY m.created_at DESC
		LIMIT ? OFFSET ?
	`, userID1, userID2, userID2, userID1, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []Message
	for rows.Next() {
		var message Message
		var createdAt string
		err := rows.Scan(&message.ID, &message.SenderID, &message.ReceiverID, &message.Content, &createdAt, &message.Read, &message.SenderName)
		if err != nil {
			return nil, err
		}
		message.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
		messages = append(messages, message)
	}

	return messages, nil
}

func MarkMessagesAsRead(senderID, receiverID int) error {
	_, err := database.DB.Exec(`
		UPDATE messages 
		SET read = 1 
		WHERE sender_id = ? AND receiver_id = ? AND read = 0
	`, senderID, receiverID)
	return err
}

func GetLastMessageWithEachUser(userID int) ([]Message, error) {
	// Get the most recent message for each conversation
	rows, err := database.DB.Query(`
		SELECT m.id, m.sender_id, m.receiver_id, m.content, m.created_at, m.read, 
		   CASE 
			   WHEN m.sender_id = ? THEN u_receiver.nickname
			   ELSE u_sender.nickname 
		   END as other_user_name
		FROM (
			SELECT 
				MAX(id) as max_id, 
				CASE 
					WHEN sender_id = ? THEN receiver_id
					ELSE sender_id 
				END as other_user_id
			FROM messages
			WHERE sender_id = ? OR receiver_id = ?
			GROUP BY other_user_id
		) as latest
		JOIN messages m ON m.id = latest.max_id
		JOIN users u_sender ON m.sender_id = u_sender.id
		JOIN users u_receiver ON m.receiver_id = u_receiver.id
		ORDER BY m.created_at DESC
	`, userID, userID, userID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []Message
	for rows.Next() {
		var message Message
		var createdAt string
		err := rows.Scan(&message.ID, &message.SenderID, &message.ReceiverID, &message.Content, &createdAt, &message.Read, &message.SenderName)
		if err != nil {
			return nil, err
		}
		message.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
		messages = append(messages, message)
	}

	return messages, nil
}

func GetUnreadMessageCount(receiverID int) (map[int]int, error) {
	rows, err := database.DB.Query(`
		SELECT sender_id, COUNT(*) as count
		FROM messages
		WHERE receiver_id = ? AND read = 0
		GROUP BY sender_id
	`, receiverID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	unreadCounts := make(map[int]int)
	for rows.Next() {
		var senderID, count int
		err := rows.Scan(&senderID, &count)
		if err != nil {
			return nil, err
		}
		unreadCounts[senderID] = count
	}

	return unreadCounts, nil
}

// GetMessageByID retrieves a message by its ID
func GetMessageByID(id int) (*Message, error) {
	var message Message
	var senderID int

	// Query the message
	err := database.DB.QueryRow(`
        SELECT id, sender_id, receiver_id, content, created_at, read, is_image
        FROM messages
        WHERE id = ?
    `, id).Scan(&message.ID, &senderID, &message.ReceiverID, &message.Content, &message.CreatedAt, &message.Read, &message.IsImage)

	if err != nil {
		return nil, err
	}

	message.SenderID = senderID

	// Get sender's name
	sender, err := GetUserByID(senderID)
	if err == nil {
		message.SenderName = sender.Nickname
	}

	return &message, nil
}
