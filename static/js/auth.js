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
        })
        .catch(error => {
            console.error('Session check failed:', error);
        });
}

function showLoginForm() {
    console.log('Showing login form');
    
    const authContainer = document.getElementById('auth-container');
    if (!authContainer) {
        console.error('Element with ID "auth-container" not found');
        return;
    }
    
    authContainer.innerHTML = `
        <div class="auth-form-container">
            <h2>Login</h2>
            <form id="login-form">
                <div class="form-group">
                    <label for="login">Nickname or Email</label>
                    <input type="text" id="login" name="login" required>
                </div>
                <div class="form-group">
                    <label for="password">Password</label>
                    <input type="password" id="password" name="password" required>
                </div>
                <button type="submit">Login</button>
            </form>
            <p>Don't have an account? <a href="#" id="show-register-link">Register</a></p>
        </div>
    `;

    // Add event listeners
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('show-register-link').addEventListener('click', showRegisterForm);
}

function showRegisterForm(e) {
    if (e) e.preventDefault();
    
    const authContainer = document.getElementById('auth-container');
    authContainer.innerHTML = `
        <div class="auth-form-container">
            <h2>Register</h2>
            <form id="register-form">
                <div class="form-group">
                    <label for="nickname">Nickname</label>
                    <input type="text" id="nickname" name="nickname" required>
                </div>
                <div class="form-group">
                    <label for="age">Age</label>
                    <input type="number" id="age" name="age" min="13" required>
                </div>
                <div class="form-group">
                    <label for="gender">Gender</label>
                    <select id="gender" name="gender" required>
                        <option value="">-- Select Gender --</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="firstName">First Name</label>
                    <input type="text" id="firstName" name="firstName" required>
                </div>
                <div class="form-group">
                    <label for="lastName">Last Name</label>
                    <input type="text" id="lastName" name="lastName" required>
                </div>
                <div class="form-group">
                    <label for="email">Email</label>
                    <input type="email" id="email" name="email" required>
                </div>
                <div class="form-group">
                    <label for="registerPassword">Password</label>
                    <input type="password" id="registerPassword" name="password" required>
                    <div class="password-criteria">
                        <p>Password must:</p>
                        <ul>
                            <li>Be at least 8 characters long</li>
                            <li>Contain at least one uppercase letter</li>
                            <li>Contain at least one lowercase letter</li>
                            <li>Contain at least one special character</li>
                        </ul>
                    </div>
                </div>
                <button type="submit">Register</button>
            </form>
            <p>Already have an account? <a href="#" id="show-login-link">Login</a></p>
        </div>
    `;

    // Add event listeners
    document.getElementById('register-form').addEventListener('submit', handleRegister);
    document.getElementById('show-login-link').addEventListener('click', showLoginForm);
}
function handleLogin(e) {
    e.preventDefault();
    
    const form = e.target;
    const login = form.login.value;
    const password = form.password.value;

    fetch('/api/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ login, password }),
    })
    .then(response => {
        if (response.ok) {
            return response.json();
        } else {
            throw new Error('Login failed');
        }
    })
    .then(data => {
        currentUser = data.user;
        showMainContent();
        initWebSocket();
        loadPosts();
    })
    .catch(error => {
        alert('Login failed. Please check your credentials and try again.');
        console.error('Login error:', error);
    });
}

function handleRegister(e) {
    e.preventDefault();
    
    const form = e.target;
    const userData = {
        nickname: form.nickname.value,
        age: parseInt(form.age.value),
        gender: form.gender.value,
        firstName: form.firstName.value,
        lastName: form.lastName.value,
        email: form.email.value,
        password: form.password.value
    };

    fetch('/api/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
    })
    .then(response => {
        if (response.ok) {
            return response.json();
        } else {
            throw new Error('Registration failed');
        }
    })
    .then(data => {
        currentUser = data.user;
        showMainContent();
        initWebSocket();
        loadPosts();
    })
    .catch(error => {
        alert('Registration failed. Please try again with different information.');
        console.error('Registration error:', error);
    });
}

function logout() {
    // First, clear local state regardless of server response
    const wasLoggedIn = currentUser !== null;
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
    
    // Update UI immediately
    document.getElementById('main-container').classList.add('hidden');
    document.getElementById('auth-container').classList.remove('hidden');
    showLoginForm();
    
    // Only attempt server logout if we were logged in
    if (wasLoggedIn) {
        fetch('/api/logout', {
            method: 'POST',
        })
        .then(response => {
            if (!response.ok) {
                console.warn('Server logout failed, but local state was cleared');
            }
        })
        .catch(error => {
            console.error('Logout error:', error);
        });
    }
}

function showMainContent() {
    console.log('Showing main content');
    
    document.getElementById('auth-container').classList.add('hidden');
    document.getElementById('main-container').classList.remove('hidden');
    
    // Update user info in header
    const userInfo = document.getElementById('user-info');
    if (userInfo) {
        userInfo.innerHTML = `
            <span>Welcome, ${currentUser.nickname}</span>
        `;
    }

    // Initialize event listeners for main content
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
    
    const homeBtn = document.getElementById('home-btn');
    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            showSection('posts-container');
            loadPosts();
        });
    }
    
    const createPostBtn = document.getElementById('create-post-btn');
    if (createPostBtn) {
        createPostBtn.addEventListener('click', () => {
            showSection('create-post-container');
        });
    }
    
    // Initialize create post form
    const createPostForm = document.getElementById('create-post-form');
    if (createPostForm) {
        createPostForm.addEventListener('submit', handleCreatePost);
    }
}