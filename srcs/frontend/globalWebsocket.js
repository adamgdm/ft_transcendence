// globalWebsocket.js
export function initializeWebSocket() {
    const socket = new WebSocket(`wss://localhost:8000/ws/friendship/`);

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
                        acceptFriendRequest(request.from_user_id);
                        notifItem.remove();
                    });
                    notifItem.querySelector('.decline-btn').addEventListener('click', () => {
                        rejectFriendRequest(request.from_user_id);
                        notifItem.remove();
                    });
                });
                break;
            case 'friend_request':
                const notifItem = document.createElement('div');
                notifItem.className = 'notif-item';
                notifItem.innerHTML = `
                    <span class="notif-text">${data.from_username} sent you a friend request.</span>
                    <button class="accept-btn">Accept</button>
                    <button class="decline-btn">Decline</button>
                `;
                notifContainer.appendChild(notifItem);

                notifItem.querySelector('.accept-btn').addEventListener('click', () => {
                    acceptFriendRequest(data.from_user_id);
                    notifItem.remove();
                });
                notifItem.querySelector('.decline-btn').addEventListener('click', () => {
                    rejectFriendRequest(data.from_user_id);
                    notifItem.remove();
                });
                break;
            case 'friend_update':
                const updateItem = document.createElement('div');
                updateItem.className = 'notif-item';
                updateItem.innerHTML = `<span class="notif-text">${data.message}</span>`;
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

    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    return socket;
}

async function acceptFriendRequest(friendId) {
    try {
        const response = await fetch('/api/accept_friend/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ friend_id: friendId })
        });
        const data = await response.json();
        console.log(data.message || data.error);
    } catch (error) {
        console.error('Error accepting friend request:', error);
    }
}

async function rejectFriendRequest(friendId) {
    try {
        const response = await fetch('/api/reject_friend/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ friend_id: friendId })
        });
        const data = await response.json();
        console.log(data.message || data.error);
    } catch (error) {
        console.error('Error rejecting friend request:', error);
    }
}