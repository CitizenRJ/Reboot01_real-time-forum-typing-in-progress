function checkSession(callback) {
    console.log('Checking user session');
    
    return api.get('/api/session')
        .then(data => {
            console.log('User session found:', data.user.nickname);
            currentUser = data.user;
            if (callback) callback(data.user);
            return data.user;
        })
        .catch(error => {
            console.error('Session check failed:', error);
            if (error.message !== 'Session expired') {
                showLoginForm();
            }
            return null;
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

    document.getElementById('register-form').addEventListener('submit', handleRegister);
    document.getElementById('show-login-link').addEventListener('click', showLoginForm);
}

function handleLogin(e) {
    e.preventDefault();
    
    const form = e.target;
    const login = form.login.value;
    const password = form.password.value;

    api.post('/api/login', { login, password })
        .then(data => {
            currentUser = data.user;
            showMainContent();
            initWebSocket();
            loadPosts();
            notifications.success('Login successful!');
        })
        .catch(error => {
            if (error.message !== 'Session expired') {
                notifications.error('Login failed: ' + error.message);
                console.error('Login error:', error);
            }
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

    api.post('/api/register', userData)
        .then(data => {
            currentUser = data.user;
            showMainContent();
            initWebSocket();
            loadPosts();
            notifications.success('Registration successful!');
        })
        .catch(error => {
            if (error.message !== 'Session expired') {
                notifications.error('Registration failed: ' + error.message);
                console.error('Registration error:', error);
            }
        });
}

function logout() {
    const wasLoggedIn = currentUser !== null;
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
        window.wsState.intentionalDisconnect = true;
        socket.close();
        socket = null;
    }
    
    document.getElementById('main-container').classList.add('hidden');
    document.getElementById('auth-container').classList.remove('hidden');
    showLoginForm();
    
    if (wasLoggedIn) {
        api.post('/api/logout')
            .catch(error => {
                if (error.message !== 'Session expired') {
                    console.error('Logout error:', error);
                }
            });
    }
}

function showMainContent() {
    console.log('Showing main content');
    
    document.getElementById('auth-container').classList.add('hidden');
    document.getElementById('main-container').classList.remove('hidden');
    
    const userInfo = document.getElementById('user-info');
    if (userInfo) {
        userInfo.innerHTML = `
            <span>Welcome, ${currentUser.nickname}</span>
        `;
    }

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
    
    const createPostForm = document.getElementById('create-post-form');
    if (createPostForm) {
        createPostForm.addEventListener('submit', handleCreatePost);
    }
}