const notifications = {
    container: null,
    
    init() {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'notification-container';
            this.container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
                width: 300px;
            `;
            document.body.appendChild(this.container);
        }
    },
    
    show(message, type = 'info', duration = 5000) {
        this.init();
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.style.cssText = `
            margin-bottom: 10px;
            padding: 15px;
            border-radius: 4px;
            color: white;
            font-weight: bold;
            animation: slideIn 0.5s;
            cursor: pointer;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            word-break: break-word;
        `;
        
        switch(type) {
            case 'error':
                notification.style.backgroundColor = '#f44336';
                break;
            case 'success':
                notification.style.backgroundColor = '#4caf50';
                break;
            case 'warning':
                notification.style.backgroundColor = '#ff9800';
                break;
            default:
                notification.style.backgroundColor = '#2196f3';
        }
        
        notification.textContent = message;
        
        notification.addEventListener('click', () => {
            notification.remove();
        });
        
        this.container.appendChild(notification);
        
        if (duration > 0) {
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.style.animation = 'slideOut 0.5s';
                    setTimeout(() => notification.remove(), 500);
                }
            }, duration);
        }
        
        return notification;
    },
    
    error(message, duration = 5000) {
        return this.show(message, 'error', duration);
    },
    
    success(message, duration = 5000) {
        return this.show(message, 'success', duration);
    },
    
    warning(message, duration = 5000) {
        return this.show(message, 'warning', duration);
    },
    
    info(message, duration = 5000) {
        return this.show(message, 'info', duration);
    }
};

const style = document.createElement('style');
style.textContent = `
@keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
}
@keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
}
`;
document.head.appendChild(style);