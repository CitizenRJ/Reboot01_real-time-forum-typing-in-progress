let currentUser = null;
let socket = null;

document.addEventListener('DOMContentLoaded', function() {
    checkSession();
    
    window.showSection = showSection;
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
    
    if (socket && socket.readyState !== WebSocket.CLOSED) {
        socket.close();
    }
    
    socket = new WebSocket(`ws://${window.location.host}/ws`);
    
    socket.onopen = function() {
        console.log('WebSocket connection established');
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
        }
    };
    
    socket.onclose = function() {
        console.log('WebSocket connection closed');
        
        fetch('/api/session')
            .then(response => {
                if (response.ok) {
                    setTimeout(function() {
                        if (currentUser) {
                            initWebSocket();
                        }
                    }, 5000);
                } else {
                    handleSessionExpired();
                }
            })
            .catch(error => {
                console.error('Session check failed:', error);
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
    
    if (socket) {
        socket.close();
        socket = null;
    }
    
    document.getElementById('main-container').classList.add('hidden');
    document.getElementById('auth-container').classList.remove('hidden');
    showLoginForm();
    
    alert('Your session has expired. Please log in again.');
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
    }
    
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
            loadOnlineUsers();
            
            setInterval(loadOnlineUsers, 30000);
        })
        .catch(error => {
            console.error('Session check failed:', error);
        });
}
