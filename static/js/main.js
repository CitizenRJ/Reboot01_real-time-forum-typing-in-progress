// Global variables
let currentUser = null;
let socket = null;

document.addEventListener('DOMContentLoaded', function() {
    // Check if user is already logged in
    checkSession();
    
    // Set up global functions
    window.showSection = showSection;
});

// Function to show a specific section and hide others
function showSection(sectionId) {
    console.log('Showing section:', sectionId);
    
    // Hide all content sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.add('hidden');
    });
    
    // Show requested section
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.remove('hidden');
    } else {
        console.error(`Section with ID ${sectionId} not found`);
    }
    
    // Update active nav button
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Map section IDs to nav button IDs
    const navMap = {
        'posts-container': 'home-btn',
        'create-post-container': 'create-post-btn'
    };
    
    if (navMap[sectionId]) {
        const navBtn = document.getElementById(navMap[sectionId]);
        if (navBtn) {
            navBtn.classList.add('active');
        }
    }
}

// Add these global variables to track intervals
let onlineUsersInterval = null;
let conversationsInterval = null;

// Initialize WebSocket connection
function initWebSocket() {
    // Add this check
    if (!currentUser) return;
    
    // Close existing socket if any
    if (socket && socket.readyState !== WebSocket.CLOSED) {
        socket.close();
    }
    
    socket = new WebSocket(`ws://${window.location.host}/ws`);
    
    socket.onopen = function() {
        console.log('WebSocket connection established');
        // Initialize chat functionality once socket is connected
        initChat();
    };
    
    socket.onmessage = function(event) {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
            case 'chat_message':
                handleIncomingMessage(message);
                break;
                
            case 'user_online':
            case 'user_offline':
                loadOnlineUsers();
                break;
                
            case 'new_post':
                // If we're on the posts page, refresh the posts
                if (!document.getElementById('posts-container').classList.contains('hidden')) {
                    loadPosts();
                }
                break;
                
            case 'new_comment':
                // If we're viewing this post, refresh the comments
                const openPostId = document.querySelector('#comment-form')?.dataset.postId;
                if (openPostId && parseInt(openPostId) === message.content.postId) {
                    viewPost(openPostId);  // Changed from loadPostDetail to viewPost
                }
                break;
        }
    };
    
    socket.onclose = function() {
        console.log('WebSocket connection closed');
        
        // Before reconnecting, check if session is still valid
        fetch('/api/session')
            .then(response => {
                if (response.ok) {
                    // Only reconnect if session is valid
                    setTimeout(function() {
                        if (currentUser) {
                            initWebSocket();
                        }
                    }, 5000);
                } else {
                    // Session is invalid, redirect to login
                    handleSessionExpired();
                }
            })
            .catch(error => {
                console.error('Session check failed:', error);
                // Wait before trying to reconnect
                setTimeout(function() {
                    if (currentUser) {
                        initWebSocket();
                    }
                }, 5000);
            });
    };
    
    socket.onerror = function(error) {
        console.error('WebSocket error:', error);
    };
}

// Add this function to handle session expiration
function handleSessionExpired() {
    // Clear user data
    currentUser = null;
    
    // Clear intervals
    if (onlineUsersInterval) {
        clearInterval(onlineUsersInterval);
        onlineUsersInterval = null;
    }
    
    if (conversationsInterval) {
        clearInterval(conversationsInterval);
        conversationsInterval = null;
    }
    
    // Close WebSocket
    if (socket) {
        socket.close();
        socket = null;
    }
    
    // Show login form
    document.getElementById('main-container').classList.add('hidden');
    document.getElementById('auth-container').classList.remove('hidden');
    showLoginForm();
    
    // Show a message to the user
    alert('Your session has expired. Please log in again.');
}

function handleIncomingMessage(message) {
    console.log("Received message:", message);
    
    // Extract message details
    let receiverId, content, senderId;
    
    if (message.content && typeof message.content === 'object') {
        receiverId = message.content.receiverId;
        content = message.content.content;
        senderId = message.sender;
    } else {
        console.error("Invalid message format:", message);
        return;
    }
    
    // If chat with this user is currently open, add the message
    const openChatUserId = document.querySelector('.chat-messages')?.dataset.userId;
    
    if (openChatUserId && 
        (parseInt(openChatUserId) === senderId || parseInt(openChatUserId) === receiverId)) {
        
        // Only add the message to the UI if it's from the other user, not from ourselves
        // This prevents duplicate messages since we already add our own messages in handleSendMessage
        if (senderId !== currentUser.id) {
            // Add the new message to the chat
            const messagesContainer = document.querySelector(`.chat-messages[data-user-id="${openChatUserId}"]`);
            const time = new Date(message.timestamp).toLocaleTimeString();
            
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message received';
            messageDiv.innerHTML = `
                <div class="message-content">${content}</div>
                <div class="message-time">${time}</div>
            `;
            
            messagesContainer.appendChild(messageDiv);
            
            // Scroll to bottom
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }
    
    // Refresh conversations list to show the new message
    loadConversations();
}
function checkSession() {
    console.log('Checking user session');
    
    fetch('/api/session')
        .then(response => {
            if (response.ok) {
                return response.json();
            } else {
                showLoginForm();
                throw new Error('Not logged in');
            }
        })
        .then(data => {
            console.log('User session found:', data.user.nickname);
            currentUser = data.user;
            showMainContent();
            initWebSocket();
            loadPosts();
            
            // Make sure online users are loaded initially
            loadOnlineUsers();
            
            // Set up periodic refresh of online users
            setInterval(loadOnlineUsers, 30000);
        })
        .catch(error => {
            console.error('Session check failed:', error);
        });
}
