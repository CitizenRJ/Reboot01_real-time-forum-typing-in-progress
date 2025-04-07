const api = {
    fetch: function(url, options = {}) {
        return fetch(url, options)
            .then(response => {
                if (!response.ok) {
                    if (response.status === 401) {
                        if (typeof handleSessionExpired === 'function') {
                            handleSessionExpired();
                        }
                        throw new Error('Session expired');
                    }
                    
                    return response.text()
                        .then(text => {
                            let errorMessage = `Request failed: ${response.status}`;
                            try {
                                const errorData = JSON.parse(text);
                                errorMessage = errorData.error || errorData.message || errorMessage;
                            } catch (e) {
                                if (text) errorMessage = text;
                            }
                            throw new Error(errorMessage);
                        });
                }
                return response.json();
            })
            .catch(error => {
                if (error.message !== 'Session expired') {
                    console.error(`API error (${url}):`, error);
                    
                    if (typeof notifications !== 'undefined') {
                        const isNetworkError = error.message === 'Failed to fetch' || 
                                              error.message.includes('NetworkError');
                        
                        if (isNetworkError) {
                            notifications.error('Network error. Please check your connection.');
                        } else {
                            notifications.error(`Error: ${error.message}`);
                        }
                    }
                }
                throw error;
            });
    },
    
    get: function(url) {
        return this.fetch(url);
    },
    
    post: function(url, data) {
        return this.fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
    },
    
    postForm: function(url, formData) {
        return this.fetch(url, {
            method: 'POST',
            body: formData
        });
    }
};