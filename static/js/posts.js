// Function to load all posts
function loadPosts() {
    console.log('Loading posts...');
    
    // Check if user is logged in
    if (!currentUser) {
        console.log('User not logged in, cannot load posts');
        return;
    }
    
    fetch('/api/posts')
        .then(response => {
            if (!response.ok) {
                if (response.status === 401) {
                    // Session expired
                    handleSessionExpired();
                    throw new Error('Session expired');
                }
                throw new Error(`Failed to load posts: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log(`Received ${data.posts ? data.posts.length : 0} posts`);
            displayPosts(data.posts || []);
        })
        .catch(error => {
            if (error.message !== 'Session expired') {
                console.error('Error loading posts:', error);
                alert('Failed to load posts. Please try again.');
            }
        });
}

// Function to display posts
function displayPosts(posts) {
    console.log(`Displaying ${posts.length} posts`);
    
    // Find or create posts-list element
    let postsContainer = document.getElementById('posts-list');
    if (!postsContainer) {
        const postsSection = document.getElementById('posts-container');
        if (postsSection) {
            console.log('Creating posts-list element');
            postsContainer = document.createElement('div');
            postsContainer.id = 'posts-list';
            postsSection.appendChild(postsContainer);
        } else {
            console.error('Posts container not found');
            return;
        }
    }
    
    // Clear container
    postsContainer.innerHTML = '';
    
    // Display message if no posts
    if (posts.length === 0) {
        postsContainer.innerHTML = '<p>No posts yet. Be the first to create one!</p>';
        return;
    }
    
    // Create post elements
    posts.forEach(post => {
        const postElement = document.createElement('div');
        postElement.className = 'post-item';
        
        // Safely access properties
        const title = post.title || 'Untitled';
        const category = post.category || 'Uncategorized';
        const content = post.content || 'No content';
        const userNickname = post.user && post.user.nickname ? post.user.nickname : 'Unknown';
        const createdDate = post.createdAt ? new Date(post.createdAt).toLocaleString() : 'Unknown date';
        
        postElement.innerHTML = `
            <h3>${title}</h3>
            <p class="post-category">${category}</p>
            <p class="post-content">${content}</p>
            <p class="post-meta">Posted by ${userNickname} on ${createdDate}</p>
            <button class="view-post-btn" data-id="${post.id}">View Details</button>
        `;
        postsContainer.appendChild(postElement);
        
        // Add event listener to view post button
        postElement.querySelector('.view-post-btn').addEventListener('click', () => {
            viewPost(post.id);
        });
    });
}

// Function to handle post creation
function handleCreatePost(e) {
    e.preventDefault();
    console.log('Creating new post');
    
    const form = e.target;
    const postData = {
        title: form.title.value,
        content: form.content.value,
        category: form.category.value
    };
    
    fetch('/api/posts', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(postData),
    })
    .then(response => {
        if (response.ok) {
            return response.json();
        } else {
            throw new Error('Failed to create post');
        }
    })
    .then(data => {
        console.log('Post created successfully');
        form.reset();
        
        // Show posts container and load posts
        showSection('posts-container');
        
        // Small delay to ensure DOM is updated
        setTimeout(() => {
            loadPosts();
        }, 50);
    })
    .catch(error => {
        console.error('Post creation error:', error);
        alert('Failed to create post. Please try again.');
    });
}

// Function to view a single post
function viewPost(postId) {
    console.log(`Viewing post with ID: ${postId}`);
    
    // First show the section, then fetch and display the post
    showSection('post-detail-container');
    
    fetch(`/api/posts/${postId}`)
        .then(response => {
            if (response.ok) {
                return response.json();
            } else {
                throw new Error(`Failed to load post: ${response.status}`);
            }
        })
        .then(data => {
            console.log('Post detail response:', data);
            console.log('Comments in response:', data.comments);
            if (!data || !data.post) {
                throw new Error('Invalid post data');
            }
            
            // If comments aren't in the response, pass an empty array
            displayPostDetail(data.post, data.comments || []);
        })
        .catch(error => {
            console.error('Error loading post details:', error);
            alert('Failed to load post details. Please try again.');
        });
}

// Function to handle adding comments
function handleAddComment(postId, commentText) {
    if (!commentText.trim()) {
        alert('Comment cannot be empty');
        return;
    }
    
    fetch('/api/comments', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            postId: postId,
            content: commentText
        }),
    })
    .then(response => {
        if (response.ok) {
            return response.json();
        } else {
            throw new Error('Failed to add comment');
        }
    })
    .then(data => {
        console.log('Comment added successfully');
        
        // Reset the comment form
        document.getElementById('comment-form').reset();
        
        // Reload post details to show the new comment
        viewPost(postId);
    })
    .catch(error => {
        console.error('Comment error:', error);
        alert('Failed to add comment. Please try again.');
    });
}

// Function to display post detail
function displayPostDetail(post, comments = []) {
    const postDetailContainer = document.getElementById('post-detail');
    if (!postDetailContainer) {
        console.error('Post detail container not found');
        return;
    }
    
    // Safely access properties
    const title = post.title || 'Untitled';
    const category = post.category || 'Uncategorized';
    const content = post.content || 'No content';
    const userNickname = post.user && post.user.nickname ? post.user.nickname : 'Unknown';
    const createdDate = post.createdAt ? new Date(post.createdAt).toLocaleString() : 'Unknown date';
    
    postDetailContainer.innerHTML = `
        <h2>${title}</h2>
        <p class="post-category">${category}</p>
        <p class="post-content">${content}</p>
        <p class="post-meta">Posted by ${userNickname} on ${createdDate}</p>
        <div class="comments-section">
            <h3>Comments</h3>
            <div id="comments-list"></div>
            <form id="comment-form" data-post-id="${post.id}">
                <div class="form-group">
                    <label for="comment">Add a comment</label>
                    <textarea id="comment" name="comment" required></textarea>
                </div>
                <button type="submit">Post Comment</button>
            </form>
        </div>
    `;
    
    // Display comments
    const commentsListContainer = document.getElementById('comments-list');
    if (comments.length === 0) {
        commentsListContainer.innerHTML = '<p>No comments yet. Be the first to comment!</p>';
    } else {
        let commentsHTML = '';
        comments.forEach(comment => {
            const commentUserName = comment.username || 'Unknown';
            const commentDate = comment.createdAt ? new Date(comment.createdAt).toLocaleString() : 'Unknown date';
    
            commentsHTML += `
                <div class="comment-item">
                    <p class="comment-content">${comment.content}</p>
                    <p class="comment-meta">Posted by ${commentUserName} on ${commentDate}</p>
                </div>
            `;
        });        commentsListContainer.innerHTML = commentsHTML;
    }
    
    // Add event listener for comment form
    document.getElementById('comment-form').addEventListener('submit', function(e) {
        e.preventDefault();
        handleAddComment(post.id, e.target.comment.value);
    });
}
// Function to show a specific section
function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.add('hidden');
    });
    
    // Show the requested section
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.remove('hidden');
    } else {
        console.error(`Section with ID ${sectionId} not found`);
    }
    
    // Return a promise that resolves after a short delay to ensure DOM updates
    return new Promise(resolve => setTimeout(resolve, 10));
}