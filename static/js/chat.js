let typingTimeout = null;
const TYPING_TIMER_LENGTH = 3000;
let isTyping = false;

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
    
    onlineUsersInterval = setInterval(loadOnlineUsers, 30000);
    conversationsInterval = setInterval(loadConversations, 30000);
    
    window.messageQueue = window.messageQueue || [];
    
    trySendQueuedMessages();
}

function trySendQueuedMessages() {
    if (!window.messageQueue) return;
    
    if (socket && socket.readyState === WebSocket.OPEN && window.messageQueue.length > 0) {
        console.log(`Attempting to send ${window.messageQueue.length} queued messages`);
        
        const messagesToSend = [...window.messageQueue];
        window.messageQueue = [];
        
        messagesToSend.forEach(msg => {
            socket.send(JSON.stringify(msg));
            notifications.success('Sent queued message', 2000);
        });
    }
}

function loadOnlineUsers() {
    if (!currentUser) return;
    
    api.get('/api/users/online')
        .then(data => {
            if (Date.now() > window.wsState.lastOnlineUsersUpdate) {
                displayOnlineUsers(data.onlineUsers);
                window.wsState.lastOnlineUsersUpdate = Date.now();
            }
        })
        .catch(error => {
            if (error.message !== 'Session expired') {
                console.error('Error loading online users:', error);
            }
        });
}

function displayOnlineUsers(onlineUserIds) {
    api.get('/api/users')
        .then(data => {
            const onlineUsersContainer = document.getElementById('online-users-list');
            const offlineUsersContainer = document.getElementById('offline-users-list');
            
            if (!offlineUsersContainer) {
                const sidebar = document.getElementById('chat-sidebar');
                const offlineHeader = document.createElement('h3');
                offlineHeader.textContent = 'Offline Users';
                const offlineList = document.createElement('div');
                offlineList.id = 'offline-users-list';
                
                sidebar.appendChild(offlineHeader);
                sidebar.appendChild(offlineList);
            }
            
            let onlineHtml = '';
            let offlineHtml = '';
            
            const sortedUsers = [...data.users].sort((a, b) => {
                return a.nickname.localeCompare(b.nickname);
            });
            
            sortedUsers.forEach(user => {
                if (user.id === currentUser.id) return;
                
                const isOnline = onlineUserIds.includes(user.id);
                const userItem = `
                    <div class="user-item ${isOnline ? 'online' : 'offline'}" data-user-id="${user.id}">
                        <span class="user-status"></span>
                        <span class="user-name">${user.nickname}</span>
                    </div>
                `;
                
                if (isOnline) {
                    onlineHtml += userItem;
                } else {
                    offlineHtml += userItem;
                }
            });
            
            onlineUsersContainer.innerHTML = onlineHtml || '<p>No users online</p>';
            document.getElementById('offline-users-list').innerHTML = offlineHtml || '<p>No offline users</p>';
            
            document.querySelectorAll('.user-item').forEach(item => {
                item.addEventListener('click', () => {
                    const userId = parseInt(item.dataset.userId);
                    const isOnline = item.classList.contains('online');
                    
                    if (!isOnline) {
                        notifications.warning('Cannot chat with offline users');
                        return;
                    }
                    
                    openChat(userId);
                });
            });
        })
        .catch(error => console.error('Error loading users:', error));
}

function loadConversations() {
    if (!currentUser) return;
    
    api.get('/api/messages')
        .then(data => {
            const conversations = data.conversations || [];
            const unreadCounts = data.unreadCounts || {};
            displayConversations(conversations, unreadCounts);
        })
        .catch(error => {
            if (error.message !== 'Session expired') {
                console.error('Error loading conversations:', error);
            }
        });
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
    api.get(`/api/users/online`)
        .then(data => {
            const isOnline = data.onlineUsers.includes(userId);
            
            api.get(`/api/users?id=${userId}`)
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
                            <span class="user-status-indicator ${isOnline ? 'online' : 'offline'}">
                                ${isOnline ? 'Online' : 'Offline'}
                            </span>
                        </div>
                        <div class="chat-messages" data-user-id="${userId}">
                            <!-- Messages will be loaded here -->
                            <div class="typing-indicator" id="typing-indicator-${userId}">
                                <div class="typing-indicator-text"></div>
                                <div class="typing-dots">
                                    <div class="typing-dot"></div>
                                    <div class="typing-dot"></div>
                                    <div class="typing-dot"></div>
                                </div>
                            </div>
                        </div>
                        <form id="chat-form" data-user-id="${userId}">
                            <input type="text" id="chat-input" placeholder="${isOnline ? 'Type a message...' : 'User is offline. Messages cannot be sent.'}" ${!isOnline ? 'disabled' : ''} required>
                            <button type="submit" ${!isOnline ? 'disabled' : ''}>Send</button>
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
                    
                    const chatInput = document.getElementById('chat-input');
                    chatInput.addEventListener('input', () => {
                        handleTypingInput(userId);
                    });
                    
                    document.getElementById(`typing-indicator-${userId}`).classList.remove('visible');
                });
        });
}

function handleTypingInput(receiverId) {
    if (!isTyping) {
        isTyping = true;
        const message = {
            type: 'typing_start',
            content: {
                receiverId: receiverId
            }
        };
        
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
        }
    }
    
    if (typingTimeout) {
        clearTimeout(typingTimeout);
    }
    
    typingTimeout = setTimeout(() => {
        isTyping = false;
        
        const message = {
            type: 'typing_stop',
            content: {
                receiverId: receiverId
            }
        };
        
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
        }
    }, TYPING_TIMER_LENGTH);
}

function loadMessages(userId, limit = 20, offset = 0) {
    api.get(`/api/messages?user=${userId}&limit=${limit}&offset=${offset}`)
        .then(data => {
            displayMessages(data.messages || [], userId);
        })
        .catch(error => {
            if (error.message !== 'Session expired') {
                console.error('Error loading messages:', error);
            }
        });
}

function displayMessages(messages, userId) {
    const messagesContainer = document.querySelector(`.chat-messages[data-user-id="${userId}"]`);
    if (!messagesContainer) return;
    
    const typingIndicator = messagesContainer.querySelector('.typing-indicator');
    const wasVisible = typingIndicator && typingIndicator.classList.contains('visible');
    
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
    
    const newIndicator = document.createElement('div');
    newIndicator.className = 'typing-indicator';
    newIndicator.id = `typing-indicator-${userId}`;
    newIndicator.innerHTML = `
        <div class="typing-indicator-text">${typingIndicator ? typingIndicator.querySelector('.typing-indicator-text').textContent : ''}</div>
        <div class="typing-dots">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;
    
    if (wasVisible) {
        newIndicator.classList.add('visible');
    }
    
    messagesContainer.appendChild(newIndicator);
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
        
        return api.get(`/api/messages?user=${userId}&limit=10&offset=${offset}`)
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
                if (error.message !== 'Session expired') {
                    console.error('Error loading more messages:', error);
                }
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
    
    if (!content.trim()) return;
    
    api.get(`/api/users/online`)
        .then(data => {
            const isOnline = data.onlineUsers.includes(userId);
            
            if (!isOnline) {
                notifications.error("Cannot send message. User is offline.");
                updateChatUIForStatusChange(userId, false);
                return;
            }
            
            if (typingTimeout) {
                clearTimeout(typingTimeout);
            }
            
            isTyping = false;
            
            const stopTypingMessage = {
                type: 'typing_stop',
                content: {
                    receiverId: userId
                }
            };
            
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify(stopTypingMessage));
            }
            
            const message = {
                type: 'chat_message',
                content: {
                    receiverId: userId,
                    content: content
                }
            };
            
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify(message));
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
                window.messageQueue = window.messageQueue || [];
                window.messageQueue.push(message);
                
                const messagesContainer = document.querySelector(`.chat-messages[data-user-id="${userId}"]`);
                if (messagesContainer) {
                    const time = new Date().toLocaleTimeString();
                    const messageDiv = document.createElement('div');
                    messageDiv.className = 'message sent pending';
                    messageDiv.innerHTML = `
                        <div class="message-content">${content}</div>
                        <div class="message-time">${time} (Pending)</div>
                    `;
                    messagesContainer.appendChild(messageDiv);
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }
                
                notifications.warning('Currently offline. Message will be sent when connection is restored.');
                
                form.querySelector('#chat-input').value = '';
                
                if (window.wsState.connectionStatus === 'disconnected' && !window.wsState.reconnectTimer) {
                    initWebSocket();
                }
            }
        })
        .catch(error => {
            notifications.error("Error checking user status");
        });
}