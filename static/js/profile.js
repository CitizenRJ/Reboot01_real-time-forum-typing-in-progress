document.addEventListener('DOMContentLoaded', function() {
    const profileBtn = document.getElementById('profile-btn');
    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
            showSection('profile-container');
            loadUserProfile();
        });
    }
    
    const changeAvatarBtn = document.getElementById('change-avatar-btn');
    if (changeAvatarBtn) {
        changeAvatarBtn.addEventListener('click', () => {
            document.getElementById('avatar-upload-form').classList.remove('hidden');
            changeAvatarBtn.classList.add('hidden');
        });
    }
    
    const avatarUploadForm = document.getElementById('avatar-upload-form');
    if (avatarUploadForm) {
        avatarUploadForm.addEventListener('submit', function(e) {
            e.preventDefault();
            uploadAvatar();
        });
    }
});

function loadUserProfile() {
    if (!currentUser) return;
    
    document.getElementById('profile-nickname').textContent = currentUser.nickname;
    document.getElementById('profile-age').textContent = currentUser.age;
    document.getElementById('profile-gender').textContent = currentUser.gender;
    document.getElementById('profile-name').textContent = `${currentUser.firstName} ${currentUser.lastName}`;
    document.getElementById('profile-email').textContent = currentUser.email;
    document.getElementById('profile-created').textContent = new Date(currentUser.createdAt).toLocaleDateString();
    
    if (currentUser.avatar) {
        document.getElementById('profile-avatar-img').src = `/uploads/avatars/${currentUser.avatar}`;
    }
    
    api.get(`/api/posts?userId=${currentUser.id}`)
    .then(data => {
        displayProfilePosts(data.posts || []);
    })
    .catch(error => {
        if (error.message !== 'Session expired') {
            console.error('Error loading user posts:', error);
        }
    });

api.get(`/api/comments?userId=${currentUser.id}`)
    .then(data => {
        displayProfileComments(data.comments || []);
    })
    .catch(error => {
        if (error.message !== 'Session expired') {
            console.error('Error loading user comments:', error);
        }
    });
}

function displayProfilePosts(posts) {
    const postsContainer = document.getElementById('profile-posts-list');
    
    if (posts.length === 0) {
        postsContainer.innerHTML = '<p>No posts yet.</p>';
        return;
    }
    
    let html = '';
    posts.slice(0, 5).forEach(post => {
        html += `
            <div class="profile-post-item">
                <h5>${post.title}</h5>
                <p>${post.content.substring(0, 100)}${post.content.length > 100 ? '...' : ''}</p>
                <p class="post-meta">Posted on ${new Date(post.createdAt).toLocaleDateString()}</p>
                <button class="view-post-btn" data-id="${post.id}">View Post</button>
            </div>
        `;
    });
    
    postsContainer.innerHTML = html;
    
    postsContainer.querySelectorAll('.view-post-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            viewPost(parseInt(btn.dataset.id));
        });
    });
}

function displayProfileComments(comments) {
    const commentsContainer = document.getElementById('profile-comments-list');
    
    if (comments.length === 0) {
        commentsContainer.innerHTML = '<p>No comments yet.</p>';
        return;
    }
    
    let html = '';
    comments.slice(0, 5).forEach(comment => {
        html += `
            <div class="profile-comment-item">
                <p>${comment.content.substring(0, 100)}${comment.content.length > 100 ? '...' : ''}</p>
                <p class="comment-meta">Commented on ${new Date(comment.createdAt).toLocaleDateString()}</p>
                <button class="view-post-btn" data-id="${comment.postId}">View Post</button>
            </div>
        `;
    });
    
    commentsContainer.innerHTML = html;
    
    commentsContainer.querySelectorAll('.view-post-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            viewPost(parseInt(btn.dataset.id));
        });
    });
}

function cropImage(file, callback) {
    const reader = new FileReader();
    
    reader.onload = function(event) {
        const img = new Image();
        
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            let size = Math.min(img.width, img.height);
            let x = (img.width - size) / 2;
            let y = (img.height - size) / 2;
            
            canvas.width = 200;
            canvas.height = 200;
            
            ctx.drawImage(img, x, y, size, size, 0, 0, canvas.width, canvas.height);
            
            canvas.toBlob(function(blob) {
                callback(blob);
            }, 'image/jpeg');
        };
        
        img.src = event.target.result;
    };
    
    reader.readAsDataURL(file);
}

function uploadAvatar() {
    const fileInput = document.getElementById('avatar-file');
    const file = fileInput.files[0];
    
    if (!file) {
        notifications.warning('Please select a file');
        return;
    }
    
    cropImage(file, function(blob) {
        const formData = new FormData();
        formData.append('avatar', blob, 'avatar.jpg');
        
        api.postForm('/api/users/avatar', formData)
            .then(data => {
                document.getElementById('profile-avatar-img').src = `/uploads/avatars/${data.avatar}`;
                
                document.getElementById('avatar-upload-form').classList.add('hidden');
                document.getElementById('change-avatar-btn').classList.remove('hidden');
                
                currentUser.avatar = data.avatar;
                
                notifications.success('Avatar uploaded successfully');
            })
            .catch(error => {
                if (error.message !== 'Session expired') {
                    console.error('Error uploading avatar:', error);
                    notifications.error('Failed to upload avatar: ' + error.message);
                }
            });
    });
}
