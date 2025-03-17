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

// Initialize WebSocket connection
function initWebSocket() {
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
        // Try to reconnect after a delay
        setTimeout(function() {
            if (currentUser) {
                initWebSocket();
            }
        }, 5000);
    };
    
    socket.onerror = function(error) {
        console.error('WebSocket error:', error);
    };
}
