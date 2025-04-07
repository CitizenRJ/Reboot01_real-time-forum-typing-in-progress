window.wsState = {
  connectionStatus: 'disconnected',
  reconnectTimer: null,
  intentionalDisconnect: false,
  reconnectAttempts: 0,
  lastOnlineUsersUpdate: 0,
  lastConversationsUpdate: 0,
  maxReconnectDelay: 30000 
};

let currentUser = null;
let socket = null;

document.addEventListener('DOMContentLoaded', function() {
    checkSession(user => {
        if (user) {
            showMainContent();
            initWebSocket();
            loadPosts();
            loadOnlineUsers();
            
            setInterval(loadOnlineUsers, 30000);
        }
    });
    
    window.showSection = showSection;
    
    window.addEventListener('beforeunload', () => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            wsState.intentionalDisconnect = true;
            socket.close();
        }
    });
    
    const header = document.querySelector('header');
    if (header) {
        const statusIndicator = document.createElement('div');
        statusIndicator.id = 'connection-status';
        statusIndicator.className = 'status-disconnected';
        statusIndicator.title = 'Disconnected';
        header.appendChild(statusIndicator);
        
        statusIndicator.addEventListener('click', () => {
            if (wsState.connectionStatus === 'disconnected' && currentUser) {
                notifications.info('Attempting to reconnect...');
                initWebSocket();
            }
        });
    }
});

function showSection(sectionId) {
    console.log('Showing section:', sectionId);
    
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.add('hidden');
    });
    
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.remove('hidden');
    } else {
        console.error(`Section with ID ${sectionId} not found`);
    }
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
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

let onlineUsersInterval = null;
let conversationsInterval = null;

function initWebSocket() {
    if (!currentUser) return;
    
    if (wsState.reconnectTimer) {
        clearTimeout(wsState.reconnectTimer);
        wsState.reconnectTimer = null;
    }
    
    if (socket && socket.readyState !== WebSocket.CLOSED) {
        socket.close();
    }
    
    updateConnectionStatus('connecting');
    wsState.intentionalDisconnect = false;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    
    socket.onopen = function() {
        console.log('WebSocket connection established');
        wsState.reconnectAttempts = 0;
        updateConnectionStatus('connected');
        notifications.success('Connected to chat server');
        initChat();
    };
    
    socket.onmessage = function(event) {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
            case 'chat_message':
                handleIncomingMessage(message);
                break;
                
            case 'user_online':
                wsState.lastOnlineUsersUpdate = Date.now();
                loadOnlineUsers();
                updateChatUIForStatusChange(message.content, true);
                break;
                
            case 'user_offline':
                wsState.lastOnlineUsersUpdate = Date.now();
                loadOnlineUsers();
                updateChatUIForStatusChange(message.content, false);
                break;
                
            case 'new_post':
                if (!document.getElementById('posts-container').classList.contains('hidden')) {
                    loadPosts();
                }
                break;
                
            case 'new_comment':
                const openPostId = document.querySelector('#comment-form')?.dataset.postId;
                if (openPostId && parseInt(openPostId) === message.content.postId) {
                    viewPost(openPostId);
                }
                break;
                
            case 'typing_start':
                handleTypingStart(message);
                break;
                
            case 'typing_stop':
                handleTypingStop(message);
                break;
                
            case 'error':
                handleServerError(message);
                break;
                
            case 'pong':
                lastPongReceived = Date.now();
                break;
        }
    };
    
    socket.onclose = function(event) {
        console.log(`WebSocket connection closed: ${event.code} - ${event.reason}`);
        updateConnectionStatus('disconnected');
        
        if (!wsState.intentionalDisconnect) {
            api.get('/api/session')
                .then(() => {
                    handleReconnect();
                })
                .catch(error => {
                    if (error.message === 'Session expired') {
                        handleSessionExpired();
                    } else {
                        console.error('Session check failed:', error);
                        handleReconnect();
                    }
                });
        }
    };
    
    socket.onerror = function(error) {
        console.error('WebSocket error:', error);
        updateConnectionStatus('disconnected');
        notifications.error('Connection error. Attempting to reconnect...', 3000);
    };
    
    setupHeartbeat();
}

let lastPongReceived = Date.now();
let heartbeatInterval = null;

function setupHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }
    
    heartbeatInterval = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping' }));
            
            const timeout = 30000;
            if (Date.now() - lastPongReceived > timeout) {
                console.warn('No pong received in the last 30 seconds, reconnecting...');
                socket.close();
                initWebSocket();
            }
        }
    }, 15000);
}

function handleReconnect() {
    const delay = Math.min(1000 * Math.pow(2, wsState.reconnectAttempts), wsState.maxReconnectDelay);
    wsState.reconnectAttempts++;
    
    notifications.warning(`Connection lost. Reconnecting in ${Math.round(delay/1000)} seconds...`);
    console.log(`Attempting to reconnect in ${delay}ms (attempt ${wsState.reconnectAttempts})`);
    
    wsState.reconnectTimer = setTimeout(() => {
        if (currentUser && !wsState.intentionalDisconnect) {
            initWebSocket();
        }
    }, delay);
}

function updateConnectionStatus(status) {
    wsState.connectionStatus = status;
    const indicator = document.getElementById('connection-status');
    if (!indicator) return;
    
    indicator.className = `status-${status}`;
    
    switch(status) {
        case 'connected':
            indicator.title = 'Connected';
            break;
        case 'connecting':
            indicator.title = 'Connecting...';
            break;
        case 'disconnected':
            indicator.title = 'Disconnected - Click to reconnect';
            break;
    }
}

function handleServerError(message) {
    const errorMessage = message.content?.message || 'Unknown server error';
    notifications.error(`Server error: ${errorMessage}`);
    console.error('Server reported an error:', message);
}

function handleSessionExpired() {
    currentUser = null;
    
    if (onlineUsersInterval) {
        clearInterval(onlineUsersInterval);
        onlineUsersInterval = null;
    }
    
    if (conversationsInterval) {
        clearInterval(conversationsInterval);
        conversationsInterval = null;
    }
    
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
    
    if (socket) {
        wsState.intentionalDisconnect = true;
        socket.close();
        socket = null;
    }
    
    document.getElementById('main-container').classList.add('hidden');
    document.getElementById('auth-container').classList.remove('hidden');
    showLoginForm();
    
    notifications.warning('Your session has expired. Please log in again.');
}

function handleIncomingMessage(message) {
    console.log("Received message:", message);
    
    let receiverId, content, senderId;
    
    if (message.content && typeof message.content === 'object') {
        receiverId = message.content.receiverId;
        content = message.content.content;
        senderId = message.sender;
    } else {
        console.error("Invalid message format:", message);
        return;
    }
    
    const openChatUserId = document.querySelector('.chat-messages')?.dataset.userId;
    
    if (openChatUserId && 
        (parseInt(openChatUserId) === senderId || parseInt(openChatUserId) === receiverId)) {
        
        if (senderId !== currentUser.id) {
            const messagesContainer = document.querySelector(`.chat-messages[data-user-id="${openChatUserId}"]`);
            const time = new Date(message.timestamp).toLocaleTimeString();
            
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message received';
            messageDiv.innerHTML = `
                <div class="message-content">${content}</div>
                <div class="message-time">${time}</div>
            `;
            
            messagesContainer.appendChild(messageDiv);
            
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    } else if (senderId !== currentUser.id) {
        api.get(`/api/users?id=${senderId}`)
            .then(data => {
                const user = data.users.find(u => u.id === senderId);
                if (user) {
                    notifications.info(`New message from ${user.nickname}`);
                }
            })
            .catch(error => console.error('Error fetching user details:', error));
    }
    
    loadConversations();
}

function handleTypingStart(message) {
    console.log("Typing start message received:", message);
    
    if (message.sender === currentUser.id) {
        return;
    }
    
    const content = message.content;
    if (!content || typeof content !== 'object') {
        console.error("Invalid typing_start message format:", message);
        return;
    }
    
    const openChatId = document.querySelector('.chat-messages')?.dataset.userId;
    console.log("Looking for chat with ID:", message.sender, "Current open chat:", openChatId);
    
    if (openChatId && parseInt(openChatId) === message.sender) {
        const messagesContainer = document.querySelector(`.chat-messages[data-user-id="${message.sender}"]`);
        if (!messagesContainer) {
            console.error("Messages container not found");
            return;
        }
        
        const indicatorEl = messagesContainer.querySelector('.typing-indicator');
        console.log("Found indicator element:", indicatorEl);
        
        if (indicatorEl) {
            const textEl = indicatorEl.querySelector('.typing-indicator-text');
            textEl.textContent = `${content.senderName || 'Someone'} is typing...`;
            
            indicatorEl.classList.add('visible');
            
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        } else {
            console.error("Typing indicator element not found in the messages container");
        }
    }
}

function handleTypingStop(message) {
    console.log("Typing stop message received:", message);
    
    if (message.sender === currentUser.id) {
        return;
    }
    
    const openChatId = document.querySelector('.chat-messages')?.dataset.userId;
    if (openChatId && parseInt(openChatId) === message.sender) {
        const messagesContainer = document.querySelector(`.chat-messages[data-user-id="${message.sender}"]`);
        if (!messagesContainer) return;
        
        const indicatorEl = messagesContainer.querySelector('.typing-indicator');
        if (indicatorEl) {
            indicatorEl.classList.remove('visible');
        }
    }
}

function updateChatUIForStatusChange(content, isOnline) {
    let userId;
    
    if (typeof content === 'number') {
        userId = content;
    } else if (content && typeof content === 'object' && content.userId) {
        userId = content.userId;
    } else {
        return;
    }
    
    const chatContainer = document.querySelector(`.chat-messages[data-user-id="${userId}"]`);
    if (!chatContainer) return; // Not chatting with this user
    
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const chatHeader = document.getElementById('chat-header');
    
    if (isOnline) {
        if (chatInput) chatInput.disabled = false;
        if (chatHeader) {
            const statusElement = chatHeader.querySelector('.user-status-indicator') || document.createElement('span');
            statusElement.className = 'user-status-indicator online';
            statusElement.textContent = 'Online';
            if (!chatHeader.querySelector('.user-status-indicator')) {
                chatHeader.appendChild(statusElement);
            }
        }
        notifications.info(`User is now online and can receive messages.`);
    } else {
        if (chatInput) {
            chatInput.disabled = true;
            chatInput.placeholder = "User is offline. Messages cannot be sent.";
        }
        if (chatHeader) {
            const statusElement = chatHeader.querySelector('.user-status-indicator') || document.createElement('span');
            statusElement.className = 'user-status-indicator offline';
            statusElement.textContent = 'Offline';
            if (!chatHeader.querySelector('.user-status-indicator')) {
                chatHeader.appendChild(statusElement);
            }
        }
        notifications.warning(`User has gone offline. Messages cannot be sent until they return.`);
    }
}
