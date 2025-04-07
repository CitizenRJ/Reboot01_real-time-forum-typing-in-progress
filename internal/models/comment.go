package models

import (
	"RTF/internal/database"
	"time"
)

type Comment struct {
	ID        int       `json:"id"`
	PostID    int       `json:"postId"`
	UserID    int       `json:"userId"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"createdAt"`
	Username  string    `json:"username,omitempty"`
}

func CreateComment(comment Comment) (int, error) {
	result, err := database.DB.Exec(
		"INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)",
		comment.PostID, comment.UserID, comment.Content,
	)
	if err != nil {
		return 0, err
	}

	id, err := result.LastInsertId()
	return int(id), err
}

func GetCommentsByPostID(postID int) ([]Comment, error) {
	rows, err := database.DB.Query("SELECT id, post_id, user_id, content, created_at FROM comments WHERE post_id = ?", postID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []Comment
	for rows.Next() {
		var comment Comment
		err := rows.Scan(&comment.ID, &comment.PostID, &comment.UserID, &comment.Content, &comment.CreatedAt)
		if err != nil {
			return nil, err
		}

		var username string
		err = database.DB.QueryRow("SELECT nickname FROM users WHERE id = ?", comment.UserID).Scan(&username)
		if err == nil {
			comment.Username = username
		}

		comments = append(comments, comment)
	}

	return comments, nil
}

func GetCommentsByUserID(userID int) ([]Comment, error) {
	rows, err := database.DB.Query(`
        SELECT c.id, c.post_id, c.user_id, c.content, c.created_at, p.title 
        FROM comments c
        JOIN posts p ON c.post_id = p.id
        WHERE c.user_id = ?
        ORDER BY c.created_at DESC
    `, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []Comment
	for rows.Next() {
		var comment Comment
		var postTitle string
		err := rows.Scan(&comment.ID, &comment.PostID, &comment.UserID, &comment.Content, &comment.CreatedAt, &postTitle)
		if err != nil {
			return nil, err
		}

		comment.Username = postTitle

		comments = append(comments, comment)
	}

	return comments, nil
}
