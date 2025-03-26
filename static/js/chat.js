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
    if (!currentUser) {
        console.log("User not logged in. Chat functionality disabled.");
        return;
    }
    
    loadOnlineUsers();
    
    loadConversations();
    
    if (onlineUsersInterval) {
        clearInterval(onlineUsersInterval);
    }
    
    if (conversationsInterval) {
        clearInterval(conversationsInterval);
    }
    
    onlineUsersInterval = setInterval(loadOnlineUsers, 30000); // Every 30 seconds
    conversationsInterval = setInterval(loadConversations, 30000); // Every 30 seconds
}

function loadOnlineUsers() {
    if (!currentUser) return;
    
    fetch('/api/users/online')
        .then(response => {
            if (!response.ok) {
                if (response.status === 401) {
                    handleSessionExpired();
                    throw new Error('Session expired');
                }
                throw new Error(`Failed to load online users: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            displayOnlineUsers(data.onlineUsers);
        })
        .catch(error => {
            if (error.message !== 'Session expired') {
                console.error('Error loading online users:', error);
            }
        });
}

function displayOnlineUsers(onlineUserIds) {
    fetch('/api/users')
        .then(response => response.json())
        .then(data => {
            const onlineUsersContainer = document.getElementById('online-users-list');
            let html = '';
            
            const sortedUsers = [...data.users].sort((a, b) => {
                return a.nickname.localeCompare(b.nickname);
            });
            
            sortedUsers.forEach(user => {
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
            
            document.querySelectorAll('.user-item').forEach(item => {
                item.addEventListener('click', () => {
                    openChat(parseInt(item.dataset.userId));
                });
            });
        })
        .catch(error => console.error('Error loading users:', error));
}

function loadConversations() {
    if (!currentUser) return;
    
    fetch('/api/messages')
        .then(response => response.json())
        .then(data => {
            const conversations = data.conversations || [];
            const unreadCounts = data.unreadCounts || {};
            displayConversations(conversations, unreadCounts);
        })
        .catch(error => console.error('Error loading conversations:', error));
}

function displayConversations(conversations, unreadCounts) {
    const conversationsContainer = document.getElementById('conversations-list');
    let html = '';
    
    if (!conversations) {
        html = '<p>No conversations yet.</p>';
    } else if (conversations.length === 0) {
        html = '<p>No conversations yet.</p>';
    } else {
        conversations.forEach(message => {
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
    
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.addEventListener('click', () => {
            openChat(parseInt(item.dataset.userId));
        });
    });
}

function openChat(userId) {
    fetch(`/api/users?id=${userId}`)
        .then(response => response.json())
        .then(userData => {
            const user = userData.users.find(u => u.id === userId);
            
            if (!user) {
                console.error('User not found');
                return;
            }
            
            showSection('chat-container');
            
            const chatContainer = document.getElementById('chat-container');
            chatContainer.innerHTML = `
                <div id="chat-header">
                    <button id="back-from-chat-btn">←</button>
                    <h3>Chat with ${user.nickname}</h3>
                </div>
                <div class="chat-messages" data-user-id="${userId}"></div>
                <form id="chat-form" data-user-id="${userId}">
                    <input type="text" id="chat-input" placeholder="Type a message..." required>
                    <button type="submit">Send</button>
                </form>
            `;
            
            loadMessages(userId);
            
            setTimeout(() => {
                setupScrollListener(userId);
            }, 500);
            
            document.getElementById('back-from-chat-btn').addEventListener('click', () => {
                showSection('posts-container');
            });
            
            document.getElementById('chat-form').addEventListener('submit', handleSendMessage);
        })
        .catch(error => console.error('Error loading user details:', error));
}

function loadMessages(userId, limit = 20, offset = 0) {
    fetch(`/api/messages?user=${userId}&limit=${limit}&offset=${offset}`)
        .then(response => response.json())
        .then(data => {
            displayMessages(data.messages || [], userId);
        })
        .catch(error => console.error('Error loading messages:', error));
}

function displayMessages(messages, userId) {
    const messagesContainer = document.querySelector(`.chat-messages[data-user-id="${userId}"]`);
    if (!messagesContainer) return;
    
    let html = '';
    
    if (!messages || messages.length === 0) {
        html = '<p class="no-messages">No messages yet. Say hi!</p>';
    } else {
        console.log("Messages to display:", messages);
        
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
    }
    
    messagesContainer.innerHTML = html;
    
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function setupScrollListener(userId) {
    const messagesContainer = document.querySelector(`.chat-messages[data-user-id="${userId}"]`);
    if (!messagesContainer) return;
    
    let currentOffset = 20;
    let allMessagesLoaded = false;
    let isLoading = false;
    
    const throttledLoadMore = throttle(function() {
        if (messagesContainer.scrollTop <= 50 && !allMessagesLoaded && !isLoading) {
            isLoading = true;
            loadMoreMessages(userId, currentOffset)
                .finally(() => {
                    isLoading = false;
                });
        }
    }, 1000);
    
    messagesContainer.addEventListener('scroll', throttledLoadMore);
    
    function loadMoreMessages(userId, offset) {
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'loading-messages';
        loadingIndicator.textContent = 'Loading more messages...';
        messagesContainer.prepend(loadingIndicator);
        
        return fetch(`/api/messages?user=${userId}&limit=10&offset=${offset}`)
            .then(response => response.json())
            .then(data => {
                messagesContainer.removeChild(loadingIndicator);
                
                if (data.messages && data.messages.length > 0) {
                    const oldHeight = messagesContainer.scrollHeight;
                    prependMessages(data.messages, userId);
                    
                    messagesContainer.scrollTop = messagesContainer.scrollHeight - oldHeight;
                    
                    currentOffset += data.messages.length;
                } else {
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
        
        const messagesContainer = document.querySelector(`.chat-messages[data-user-id="${userId}"]`);
        messagesContainer.innerHTML = html + messagesContainer.innerHTML;
    }
}

function handleSendMessage(e) {
    e.preventDefault();
    
    const form = e.target;
    const userId = parseInt(form.dataset.userId);
    const content = form.querySelector('#chat-input').value;
    
    if (!content.trim()) return; // Don't send empty messages
    
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'chat_message',
            content: {
                receiverId: userId,
                content: content
            }
        }));
        
        form.querySelector('#chat-input').value = '';
        
        const messagesContainer = document.querySelector(`.chat-messages[data-user-id="${userId}"]`);
        if (messagesContainer) {
            const time = new Date().toLocaleTimeString();
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message sent';
            messageDiv.innerHTML = `
                <div class="message-content">${content}</div>
                <div class="message-time">${time}</div>
            `;
            messagesContainer.appendChild(messageDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    } else {
        alert('Connection lost. Please refresh the page.');
    }
}