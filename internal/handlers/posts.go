package handlers

import (
	"RTF/internal/models"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
)

func HandlePosts(w http.ResponseWriter, r *http.Request) {
	log.Printf("HandlePosts called with method: %s", r.Method)

	// Check if user is authenticated
	cookie, err := r.Cookie("session_id")
	if err != nil {
		log.Printf("No session cookie found: %v", err)
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}
	log.Printf("Found session cookie: %s", cookie.Value)

	user, err := models.GetUserBySessionID(cookie.Value)
	if err != nil {
		log.Printf("Invalid session %s: %v", cookie.Value, err)
		http.Error(w, "Invalid session", http.StatusUnauthorized)
		return
	}
	log.Printf("User authenticated: %s (ID: %d)", user.Nickname, user.ID)

	switch r.Method {
	case "GET":
		// Handle GET request (list posts)
		log.Printf("Fetching all posts")

		posts, err := models.GetAllPosts()
		if err != nil {
			log.Printf("Error fetching posts: %v", err)
			http.Error(w, "Failed to fetch posts", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		response := map[string]interface{}{"posts": posts}
		responseJSON, err := json.Marshal(response)
		if err != nil {
			log.Printf("Error marshaling response: %v", err)
			http.Error(w, "Error creating response", http.StatusInternalServerError)
			return
		}
		log.Printf("Sending response: %s", string(responseJSON))
		json.NewEncoder(w).Encode(response)

	case "POST":
		// Handle POST request (create post)
		log.Printf("Creating new post")

		// Read request body
		body, err := io.ReadAll(r.Body)
		if err != nil {
			log.Printf("Error reading request body: %v", err)
			http.Error(w, "Error reading request body", http.StatusBadRequest)
			return
		}

		// Log request body
		log.Printf("Request body: %s", string(body))

		// Parse post data
		var post models.Post
		err = json.Unmarshal(body, &post)
		if err != nil {
			log.Printf("Error unmarshaling JSON: %v", err)
			http.Error(w, "Invalid JSON format: "+err.Error(), http.StatusBadRequest)
			return
		}
		log.Printf("Parsed post: %+v", post)

		// Validate post data
		if post.Title == "" || post.Content == "" || post.Category == "" {
			log.Printf("Validation error: Missing required fields in post: %+v", post)
			http.Error(w, "Title, content, and category are required", http.StatusBadRequest)
			return
		}
		log.Printf("Post validation passed")

		// Set user ID for the post
		post.UserID = user.ID

		// Create post in database
		postID, err := models.CreatePost(post)
		if err != nil {
			log.Printf("Post creation error: %v", err)
			http.Error(w, "Failed to create post: "+err.Error(), http.StatusInternalServerError)
			return
		}
		log.Printf("Post created with ID: %d", postID)
		// Fetch comments for the new post (will be empty for a new post)
		comments, err := models.GetCommentsByPostID(postID)
		if err != nil {
			log.Printf("Error fetching comments: %v", err)
			comments = []models.Comment{} // Use empty array if there's an error
		}

		// Return created post
		post.ID = postID
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"post":     post,
			"comments": comments,
		})
	default:
		log.Printf("Method not allowed: %s", r.Method)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func HandlePostDetail(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract post ID from URL
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 3 {
		http.Error(w, "Invalid post ID", http.StatusBadRequest)
		return
	}

	postID, err := strconv.Atoi(parts[len(parts)-1])
	if err != nil {
		http.Error(w, "Invalid post ID", http.StatusBadRequest)
		return
	}

	post, err := models.GetPostByID(postID)
	if err != nil {
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	}

	comments, err := models.GetCommentsByPostID(postID)
	if err != nil {
		// Log the error but don't return - we can still show the post without comments
		log.Printf("Error fetching comments: %v", err)
		comments = []models.Comment{} // Use empty array instead of nil
	}

	// Log the number of comments found
	log.Printf("Found %d comments for post %d", len(comments), postID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"post":     post,
		"comments": comments,
	})
}
