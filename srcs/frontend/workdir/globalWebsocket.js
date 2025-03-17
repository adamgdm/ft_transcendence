// globalWebsocket.js

let socket = null;
let retryCount = 0;
const MAX_RETRIES = 3;

export function initializeWebSocket() {
    let wsUrl = window.location.host
    const socket = new WebSocket(`wss://${wsUrl}/ws/friendship/`);

    socket.onopen = () => {
        console.log('WebSocket connected');
        const keepAlive = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'ping' }));
            } else {
                clearInterval(keepAlive);
            }
        }, 30000);
    };

    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (retryCount < MAX_RETRIES) {
            retryCount++;
            console.log(`Retrying WebSocket connection (${retryCount}/${MAX_RETRIES})...`);
            setTimeout(initializeWebSocket, 3000); // Retry after 3 seconds
        } else {
            console.error('Max retries reached. WebSocket connection failed.');
        }
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const notifContainer = document.querySelector('[layout="notifbar"] .notif-container');
        if (!notifContainer) return;

        switch (data.type) {
            case 'pending_friend_requests':
                data.requests.forEach(request => {
                    const notifItem = document.createElement('div');
                    notifItem.className = 'notif-item';
                    notifItem.innerHTML = `
                        <span class="notif-text">${request.from_username} sent you a friend request.</span>
                        <button class="accept-btn">Accept</button>
                        <button class="decline-btn">Decline</button>
                    `;
                    notifContainer.appendChild(notifItem);

                    notifItem.querySelector('.accept-btn').addEventListener('click', () => {
                        acceptFriendRequest(request.from_username);
                        notifItem.remove();
                    });
                    notifItem.querySelector('.decline-btn').addEventListener('click', () => {
                        rejectFriendRequest(request.from_username);
                        notifItem.remove();
                    });
                });
                break;
            case 'new_friend_request_notification':
                const notifItem = document.createElement('div');
                notifItem.className = 'notif-item';
                notifItem.innerHTML = `
                    <span class="notif-text">${data.from_username} sent you a friend request.</span>
                    <button class="accept-btn">Accept</button>
                    <button class="decline-btn">Decline</button>
                `;
                notifContainer.appendChild(notifItem);

                notifItem.querySelector('.accept-btn').addEventListener('click', () => {
                    acceptFriendRequest(data.from_username);
                    notifItem.remove();
                });
                notifItem.querySelector('.decline-btn').addEventListener('click', () => {
                    rejectFriendRequest(data.from_username);
                    notifItem.remove();
                });
                break;
            case 'friend_request_accepted_notification':
                const updateItem = document.createElement('div');
                updateItem.className = 'notif-item';
                updateItem.innerHTML = `<span class="notif-text">${data.from_username} accepted your friend request!</span>`;
                notifContainer.appendChild(updateItem);
                break;
            case 'pong':
                // Heartbeat response
                break;
            case 'error':
                console.error('WebSocket error:', data.message);
                break;
            default:
                console.log('Unknown message type:', data);
        }
    };

    socket.onclose = () => {
        console.log('WebSocket disconnected');
        setTimeout(() => initializeWebSocket(), 2000); // Reconnect after 2 seconds
    };


    return socket;
}

async function acceptFriendRequest(username) {
    // Send a WebSocket message to the backend
    socket.send(JSON.stringify({
        type: 'accept_friend_request',
        friend_username: username
    }));

    // Return a promise that resolves when the backend acknowledges the request
    return new Promise((resolve) => {
        const handleMessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'friend_request_accepted' && data.friend_username === username) {
                socket.removeEventListener('message', handleMessage); // Clean up the listener
                resolve({ message: data.message });
            } else if (data.type === 'friend_request_error' && data.friend_username === username) {
                socket.removeEventListener('message', handleMessage); // Clean up the listener
                resolve({ error: data.error });
            }
        };

        socket.addEventListener('message', handleMessage);
    });
}

async function rejectFriendRequest(username) {
    // Send a WebSocket message to the backend
    socket.send(JSON.stringify({
        type: 'reject_friend_request',
        friend_username: username
    }));

    // Return a promise that resolves when the backend acknowledges the request
    return new Promise((resolve) => {
        const handleMessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'friend_request_rejected' && data.friend_username === username) {
                socket.removeEventListener('message', handleMessage); // Clean up the listener
                resolve({ message: data.message });
            } else if (data.type === 'friend_request_error' && data.friend_username === username) {
                socket.removeEventListener('message', handleMessage); // Clean up the listener
                resolve({ error: data.error });
            }
        };

        socket.addEventListener('message', handleMessage);
    });
}