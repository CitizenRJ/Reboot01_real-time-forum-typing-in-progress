package models

import (
	"RTF/internal/database"
	"time"
)

type Post struct {
	ID        int       `json:"id"`
	UserID    int       `json:"userId"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	Category  string    `json:"category"`
	CreatedAt time.Time `json:"createdAt"`
	User      *User     `json:"user,omitempty"`
}

func CreatePost(post Post) (int, error) {
	result, err := database.DB.Exec(
		"INSERT INTO posts (user_id, title, content, category) VALUES (?, ?, ?, ?)",
		post.UserID, post.Title, post.Content, post.Category,
	)
	if err != nil {
		return 0, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}

	return int(id), nil
}

func GetAllPosts() ([]Post, error) {
	rows, err := database.DB.Query(`
		SELECT p.id, p.user_id, p.title, p.content, p.category, p.created_at, 
		       u.id, u.nickname, u.email
		FROM posts p
		JOIN users u ON p.user_id = u.id
		ORDER BY p.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []Post
	for rows.Next() {
		var post Post
		var user User

		err := rows.Scan(
			&post.ID, &post.UserID, &post.Title, &post.Content, &post.Category, &post.CreatedAt,
			&user.ID, &user.Nickname, &user.Email,
		)
		if err != nil {
			return nil, err
		}

		post.User = &user
		posts = append(posts, post)
	}

	return posts, nil
}

func GetPostByID(id int) (Post, error) {
	var post Post
	var user User

	err := database.DB.QueryRow(`
		SELECT p.id, p.user_id, p.title, p.content, p.category, p.created_at, 
		       u.id, u.nickname, u.email
		FROM posts p
		JOIN users u ON p.user_id = u.id
		WHERE p.id = ?
	`, id).Scan(
		&post.ID, &post.UserID, &post.Title, &post.Content, &post.Category, &post.CreatedAt,
		&user.ID, &user.Nickname, &user.Email,
	)

	if err != nil {
		return Post{}, err
	}

	post.User = &user
	return post, nil
}

func GetPostsByCategory(category string) ([]Post, error) {
	rows, err := database.DB.Query(`
		SELECT p.id, p.user_id, p.title, p.content, p.category, p.created_at, u.nickname
		FROM posts p
		JOIN users u ON p.user_id = u.id
		WHERE p.category = ?
		ORDER BY p.created_at DESC
	`, category)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []Post
	for rows.Next() {
		var post Post
		var createdAt string
		err := rows.Scan(&post.ID, &post.UserID, &post.Title, &post.Content, &post.Category, &createdAt, &post.User.Nickname)
		if err != nil {
			return nil, err
		}
		post.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
		posts = append(posts, post)
	}

	return posts, nil
}
