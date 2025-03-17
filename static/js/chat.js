// Throttle function to limit how often a function can be called
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

function initChat() {
    // Load online users
    loadOnlineUsers();
    
    // Load conversations
    loadConversations();
    
    // Update chat periodically
    setInterval(loadOnlineUsers, 30000); // Every 30 seconds
    setInterval(loadConversations, 30000); // Every 30 seconds
}

function loadOnlineUsers() {
    fetch('/api/users/online')
        .then(response => response.json())
        .then(data => {
            displayOnlineUsers(data.onlineUsers);
        })
        .catch(error => console.error('Error loading online users:', error));
}

function displayOnlineUsers(onlineUserIds) {
    // Get all users first
    fetch('/api/users')
        .then(response => response.json())
        .then(data => {
            const onlineUsersContainer = document.getElementById('online-users-list');
            let html = '';
            
            // Sort users alphabetically by nickname
            const sortedUsers = [...data.users].sort((a, b) => {
                // First sort by whether they have messages (existing code would handle this)
                // Then sort alphabetically by nickname
                return a.nickname.localeCompare(b.nickname);
            });
            
            sortedUsers.forEach(user => {
                // Skip current user
                if (user.id === currentUser.id) return;
                
                const isOnline = onlineUserIds.includes(user.id);
                html += `
                    <div class="user-item ${isOnline ? 'online' : 'offline'}" data-user-id="${user.id}">
                        <span class="user-status"></span>
                        <span class="user-name">${user.nickname}</span>
                    </div>
                `;
            });
            
            onlineUsersContainer.innerHTML = html;
            
            // Add event listeners
            document.querySelectorAll('.user-item').forEach(item => {
                item.addEventListener('click', () => {
                    openChat(parseInt(item.dataset.userId));
                });
            });
        })
        .catch(error => console.error('Error loading users:', error));
}
function loadConversations() {
    fetch('/api/messages')
        .then(response => response.json())
        .then(data => {
            // Ensure data.conversations and data.unreadCounts exist
            const conversations = data.conversations || [];
            const unreadCounts = data.unreadCounts || {};
            displayConversations(conversations, unreadCounts);
        })
        .catch(error => console.error('Error loading conversations:', error));
}

function displayConversations(conversations, unreadCounts) {
    const conversationsContainer = document.getElementById('conversations-list');
    let html = '';
    
    // Check if conversations is null or undefined
    if (!conversations) {
        html = '<p>No conversations yet.</p>';
    } else if (conversations.length === 0) {
        html = '<p>No conversations yet.</p>';
    } else {
        conversations.forEach(message => {
            // Determine the other user in the conversation
            const otherUserId = message.senderId === currentUser.id ? message.receiverId : message.senderId;
            const unreadCount = unreadCounts[otherUserId] || 0;
            
            html += `
                <div class="conversation-item" data-user-id="${otherUserId}">
                    <div class="conversation-name">${message.senderName}</div>
                    <div class="conversation-preview">${message.content.substring(0, 30)}${message.content.length > 30 ? '...' : ''}</div>
                    ${unreadCount > 0 ? `<div class="unread-badge">${unreadCount}</div>` : ''}
                </div>
            `;
        });
    }
    
    conversationsContainer.innerHTML = html;
    
    // Add event listeners
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.addEventListener('click', () => {
            openChat(parseInt(item.dataset.userId));
        });
    });
}
function openChat(userId) {
    // Get user details
    fetch(`/api/users?id=${userId}`)
        .then(response => response.json())
        .then(userData => {
            const user = userData.users.find(u => u.id === userId);
            
            if (!user) {
                console.error('User not found');
                return;
            }
            
            // Show chat container
            showSection('chat-container');
            
            // Set up chat header
            const chatHeader = document.getElementById('chat-header');
            chatHeader.innerHTML = `
                <button id="back-from-chat-btn">←</button>
                <h3>Chat with ${user.nickname}</h3>
            `;
            
            // Set up chat content
            const chatContainer = document.getElementById('chat-container');
            if (!chatContainer.querySelector('.chat-messages')) {
                chatContainer.innerHTML += `
                    <div class="chat-messages" data-user-id="${userId}"></div>
                    <form id="chat-form" data-user-id="${userId}">
                        <input type="text" id="chat-input" placeholder="Type a message..." required>
                        <label for="image-upload" class="image-upload-label">
                            <img src="/img/image-icon.png" alt="Upload Image" title="Upload Image">
                            <input type="file" id="image-upload" accept="image/*" style="display: none;">
                        </label>
                        <button type="submit">Send</button>
                    </form>
                `;
            } else {
                // Update user ID in chat elements
                chatContainer.querySelector('.chat-messages').dataset.userId = userId;
                chatContainer.querySelector('#chat-form').dataset.userId = userId;
            }
            
            // Load messages
            loadMessages(userId);
            
            // Set up scroll listener for loading more messages
            setTimeout(() => {
                setupScrollListener(userId);
            }, 500);
            
            // Add event listeners
            document.getElementById('back-from-chat-btn').addEventListener('click', () => {
                showSection('posts-container');
            });
            
            document.getElementById('chat-form').addEventListener('submit', handleSendMessage);
            
            // Add event listener for image upload
            document.getElementById('image-upload').addEventListener('change', function(e) {
                handleImageUpload(e, userId);
            });
        })
        .catch(error => console.error('Error loading user details:', error));
}function loadMessages(userId, limit = 20, offset = 0) {
    fetch(`/api/messages?user=${userId}&limit=${limit}&offset=${offset}`)
        .then(response => response.json())
        .then(data => {
            displayMessages(data.messages, userId);
        })
        .catch(error => console.error('Error loading messages:', error));
}

function displayMessages(messages, userId) {
    const messagesContainer = document.querySelector(`.chat-messages[data-user-id="${userId}"]`);
    let html = '';
    
    if (messages.length === 0) {
        html = '<p class="no-messages">No messages yet. Say hi!</p>';
    } else {
        // Sort messages by timestamp (oldest first)
        messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        
        messages.forEach(message => {
            const isFromMe = message.senderId === currentUser.id;
            const time = new Date(message.createdAt).toLocaleTimeString();
            
            html += `
                <div class="message ${isFromMe ? 'sent' : 'received'}">
                    <div class="message-content">
                        ${message.isImage 
                            ? `<img src="/uploads/chat/${message.content}" class="chat-image" alt="Chat image">`
                            : message.content}
                    </div>
                    <div class="message-time">${time}</div>
                </div>
            `;
        });
    }
    
    messagesContainer.innerHTML = html;
    
    // Add click event to enlarge images
    messagesContainer.querySelectorAll('.chat-image').forEach(img => {
        img.addEventListener('click', function() {
            const modal = document.createElement('div');
            modal.className = 'image-modal';
            modal.innerHTML = `
                <div class="image-modal-content">
                    <img src="${this.src}" alt="Enlarged image">
                </div>
            `;
            document.body.appendChild(modal);
            
            modal.addEventListener('click', function() {
                document.body.removeChild(modal);
            });
        });
    });
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
function setupScrollListener(userId) {
    const messagesContainer = document.querySelector(`.chat-messages[data-user-id="${userId}"]`);
    if (!messagesContainer) return;
    
    // Track current offset and whether all messages are loaded
    let currentOffset = 20; // Start with offset 20 since we initially load 20
    let allMessagesLoaded = false;
    let isLoading = false;
    
    // Use throttle to prevent multiple rapid calls
    const throttledLoadMore = throttle(function() {
        // Check if we're near the top of the container
        if (messagesContainer.scrollTop <= 50 && !allMessagesLoaded && !isLoading) {
            isLoading = true;
            loadMoreMessages(userId, currentOffset)
                .finally(() => {
                    isLoading = false;
                });
        }
    }, 1000); // Only allow once per second
    
    messagesContainer.addEventListener('scroll', throttledLoadMore);
    
    function loadMoreMessages(userId, offset) {
        // Show loading indicator
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'loading-messages';
        loadingIndicator.textContent = 'Loading more messages...';
        messagesContainer.prepend(loadingIndicator);
        
        // Load more messages
        return fetch(`/api/messages?user=${userId}&limit=10&offset=${offset}`)
            .then(response => response.json())
            .then(data => {
                // Remove loading indicator
                messagesContainer.removeChild(loadingIndicator);
                
                if (data.messages && data.messages.length > 0) {
                    // Prepend messages to the container
                    const oldHeight = messagesContainer.scrollHeight;
                    prependMessages(data.messages, userId);
                    
                    // Maintain scroll position
                    messagesContainer.scrollTop = messagesContainer.scrollHeight - oldHeight;
                    
                    // Update offset for next load
                    currentOffset += data.messages.length;
                } else {
                    // No more messages to load
                    allMessagesLoaded = true;
                    const endMarker = document.createElement('div');
                    endMarker.className = 'end-of-messages';
                    endMarker.textContent = 'Beginning of conversation';
                    messagesContainer.prepend(endMarker);
                }
            })
            .catch(error => {
                console.error('Error loading more messages:', error);
                messagesContainer.removeChild(loadingIndicator);
            });
    }
    
    function prependMessages(messages, userId) {
        // Sort messages by timestamp (oldest first)
        messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        
        let html = '';
        messages.forEach(message => {
            const isFromMe = message.senderId === currentUser.id;
            const time = new Date(message.createdAt).toLocaleTimeString();
            
            html += `
                <div class="message ${isFromMe ? 'sent' : 'received'}">
                    <div class="message-content">${message.content}</div>
                    <div class="message-time">${time}</div>
                </div>
            `;
        });
        
        // Prepend to existing messages
        const existingMessages = messagesContainer.innerHTML;
        messagesContainer.innerHTML = html + existingMessages;
    }
}
function handleSendMessage(e) {
    e.preventDefault();
    
    const form = e.target;
    const userId = parseInt(form.dataset.userId);
    const content = form.querySelector('#chat-input').value;
    
    // Send message via WebSocket
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'chat_message',
            receiver: userId,
            content: content,
        }));
        
        // Clear input
        form.querySelector('#chat-input').value = '';
    } else {
        alert('Connection lost. Please refresh the page.');
    }
}
    // Function to handle incoming messages via WebSocket
    function handleIncomingMessage(message) {
        // If chat with this user is currently open, add the message
        const openChatUserId = document.querySelector('.chat-messages')?.dataset.userId;
    
        if (openChatUserId && 
            (parseInt(openChatUserId) === message.senderId || parseInt(openChatUserId) === message.receiver)) {
        
            // Add the new message to the chat
            const messagesContainer = document.querySelector(`.chat-messages[data-user-id="${openChatUserId}"]`);
            const isFromMe = message.senderId === currentUser.id;
            const time = new Date(message.timestamp).toLocaleTimeString();
        
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${isFromMe ? 'sent' : 'received'}`;
            messageDiv.innerHTML = `
                <div class="message-content">
                    ${message.isImage 
                        ? `<img src="/uploads/chat/${message.content}" class="chat-image" alt="Chat image">`
                        : message.content}
                </div>
                <div class="message-time">${time}</div>
            `;
        
            messagesContainer.appendChild(messageDiv);
        
            // Add click event to enlarge image if it's an image message
            if (message.isImage) {
                const img = messageDiv.querySelector('.chat-image');
                img.addEventListener('click', function() {
                    const modal = document.createElement('div');
                    modal.className = 'image-modal';
                    modal.innerHTML = `
                        <div class="image-modal-content">
                            <img src="${this.src}" alt="Enlarged image">
                        </div>
                    `;
                    document.body.appendChild(modal);
                
                    modal.addEventListener('click', function() {
                        document.body.removeChild(modal);
                    });
                });
            }
        
            // Scroll to bottom
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    
        // Refresh conversations list to show the new message
        loadConversations();
    }
function handleImageUpload(e, userId) {
    const file = e.target.files[0];
    if (!file) return;
    
    // Check if file is an image
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
    }
    
    // Check file size (limit to 5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert('Image size should be less than 5MB');
        return;
    }
    
    // Show loading indicator
    const chatInput = document.getElementById('chat-input');
    const originalPlaceholder = chatInput.placeholder;
    chatInput.placeholder = 'Uploading image...';
    chatInput.disabled = true;
    
    // Upload image
    const formData = new FormData();
    formData.append('image', file);
    formData.append('receiverId', userId);
    
    fetch('/api/messages/image', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (response.ok) {
            return response.json();
        } else {
            throw new Error('Failed to upload image');
        }
    })
    .then(data => {
        // Reset file input
        document.getElementById('image-upload').value = '';
        
        // Reset chat input
        chatInput.placeholder = originalPlaceholder;
        chatInput.disabled = false;
        
        // The server will broadcast the message via WebSocket,
        // so we don't need to manually add it to the chat
    })
    .catch(error => {
        console.error('Error uploading image:', error);
        alert('Failed to upload image. Please try again.');
        
        // Reset chat input
        chatInput.placeholder = originalPlaceholder;
        chatInput.disabled = false;
    });
}
