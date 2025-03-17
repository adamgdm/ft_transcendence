// frontend/globalWebsocket.js

let friendshipSocket = null;
const RECONNECT_DELAY = 5000;
const currentUsername = localStorage.getItem('username');
let pendingNotifications = [];

function initializeWebSocket() {
    const wsUrl = `wss://localhost:8000/ws/friendship/`;
    friendshipSocket = new WebSocket(wsUrl);

    friendshipSocket.onopen = () => {
        console.log('Friendship WebSocket connection established');
    };

    friendshipSocket.onclose = (e) => {
        console.log('Friendship WebSocket connection closed', e);
        setTimeout(() => {
            if (localStorage.getItem('isAuthenticated') === 'true' && friendshipSocket.readyState !== WebSocket.OPEN) {
                initializeWebSocket();
            }
        }, RECONNECT_DELAY);
    };

    friendshipSocket.onerror = (error) => {
        console.error('Friendship WebSocket error:', error);
    };

    friendshipSocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type.includes('notification') || data.type.includes('pending')) {
                pendingNotifications.push(data);
                processNotifications();
            }
            window.dispatchEvent(new CustomEvent('websocketMessage', { detail: data }));
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    };

    function processNotifications() {
        const notifContainer = document.querySelector('[layout="notifbar"] .notif-container');
        if (!notifContainer) return;

        while (pendingNotifications.length > 0) {
            const data = pendingNotifications.shift();
            switch (data.type) {
                case 'pending_friend_requests':
                    data.requests.forEach(request => {
                        if (request.from_username !== currentUsername) {
                            appendFriendRequestNotification(notifContainer, request.from_username);
                        }
                    });
                    break;
                case 'new_friend_request_notification':
                    if (data.from_username !== currentUsername) {
                        appendFriendRequestNotification(notifContainer, data.from_username);
                    }
                    break;
                case 'friend_request_accepted_notification':
                    if (data.from_username !== currentUsername) {
                        const updateItem = document.createElement('div');
                        updateItem.className = 'notif-item';
                        updateItem.innerHTML = `<span class="notif-text">${data.from_username} accepted your friend request!</span>`;
                        notifContainer.appendChild(updateItem);
                    }
                    break;
                case 'friend_request_rejected_notification':
                    if (data.from_username !== currentUsername) {
                        const updateItem = document.createElement('div');
                        updateItem.className = 'notif-item';
                        updateItem.innerHTML = `<span class="notif-text">${data.from_username} rejected your friend request.</span>`;
                        notifContainer.appendChild(updateItem);
                    }
                    break;
                case 'pending_game_invites':
                    data.invites.forEach(invite => {
                        if (invite.from_username !== currentUsername) {
                            appendGameInviteNotification(notifContainer, invite.from_username, invite.game_mode, invite.invite_id);
                        }
                    });
                    break;
                case 'new_game_invite_notification':
                    if (data.from_username !== currentUsername) {
                        appendGameInviteNotification(notifContainer, data.from_username, data.game_mode, data.invite_id);
                    }
                    break;
                case 'game_invite_accepted_notification':
                    if (data.to_username !== currentUsername) {
                        const updateItem = document.createElement('div');
                        updateItem.className = 'notif-item';
                        updateItem.innerHTML = `<span class="notif-text">${data.to_username} accepted your game invite!</span>`;
                        notifContainer.appendChild(updateItem);
                    }
                    break;
                case 'game_invite_rejected_notification':
                    if (data.from_username !== currentUsername) {
                        const updateItem = document.createElement('div');
                        updateItem.className = 'notif-item';
                        updateItem.innerHTML = `<span class="notif-text">${data.from_username} rejected your game invite.</span>`;
                        notifContainer.appendChild(updateItem);
                    }
                    break;
                case 'pong':
                    break;
                case 'error':
                    console.error('WebSocket error from server:', data.message);
                    break;
                default:
                    console.log('Unknown message type:', data);
            }
        }
    }
}

function appendFriendRequestNotification(container, fromUsername) {
    const notifItem = document.createElement('div');
    notifItem.className = 'notif-item';
    notifItem.innerHTML = `
        <span class="notif-text">${fromUsername} sent you a friend request.</span>
        <button class="accept-btn">Accept</button>
        <button class="decline-btn">Decline</button>
    `;
    container.appendChild(notifItem);

    notifItem.querySelector('.accept-btn').addEventListener('click', async () => {
        const result = await acceptFriendRequest(fromUsername);
        if (!result.error) notifItem.remove();
    });
    notifItem.querySelector('.decline-btn').addEventListener('click', async () => {
        const result = await rejectFriendRequest(fromUsername);
        if (!result.error) notifItem.remove();
    });
}

function appendGameInviteNotification(container, fromUsername, gameMode, inviteId) {
    const notifItem = document.createElement('div');
    notifItem.className = 'notif-item';
    notifItem.innerHTML = `
        <span class="notif-text">${fromUsername} invited you to a ${gameMode} game!</span>
        <button class="accept-btn">Accept</button>
        <button class="decline-btn">Decline</button>
    `;
    container.appendChild(notifItem);

    notifItem.querySelector('.accept-btn').addEventListener('click', async () => {
        if (!friendshipSocket || friendshipSocket.readyState !== WebSocket.OPEN) {
            console.error('WebSocket connection not open');
            return;
        }
        friendshipSocket.send(JSON.stringify({
            type: 'accept_game_invite',
            invite_id: inviteId
        }));
        notifItem.remove();
    });

    notifItem.querySelector('.decline-btn').addEventListener('click', async () => {
        if (!friendshipSocket || friendshipSocket.readyState !== WebSocket.OPEN) {
            console.error('WebSocket connection not open');
            return;
        }
        friendshipSocket.send(JSON.stringify({
            type: 'reject_game_invite',
            invite_id: inviteId
        }));
        notifItem.remove();
    });
}

function sendFriendRequest(friendUsername) {
    if (!friendshipSocket || friendshipSocket.readyState !== WebSocket.OPEN) {
        console.error('WebSocket connection not open');
        return Promise.resolve({ error: 'WebSocket connection not open' });
    }
    friendshipSocket.send(JSON.stringify({
        type: 'send_friend_request',
        friend_username: friendUsername
    }));
    return new Promise((resolve) => {
        const handleMessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'friend_request_sent' && data.friend_username === friendUsername) {
                friendshipSocket.removeEventListener('message', handleMessage);
                resolve({ message: data.message || 'Friend request sent successfully' });
            } else if (data.type === 'friend_request_error' && data.friend_username === friendUsername) {
                friendshipSocket.removeEventListener('message', handleMessage);
                resolve({ error: data.error || 'Failed to send friend request' });
            }
        };
        friendshipSocket.addEventListener('message', handleMessage);
    });
}

function acceptFriendRequest(friendUsername) {
    if (!friendshipSocket || friendshipSocket.readyState !== WebSocket.OPEN) {
        console.error('WebSocket connection not open');
        return Promise.resolve({ error: 'WebSocket connection not open' });
    }
    friendshipSocket.send(JSON.stringify({
        type: 'accept_friend_request',
        friend_username: friendUsername
    }));
    return new Promise((resolve) => {
        const handleMessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'friend_request_accepted' && data.friend_username === friendUsername) {
                friendshipSocket.removeEventListener('message', handleMessage);
                resolve({ message: data.message || 'Friend request accepted successfully' });
            } else if (data.type === 'friend_request_error' && data.friend_username === friendUsername) {
                friendshipSocket.removeEventListener('message', handleMessage);
                resolve({ error: data.error || 'Failed to accept friend request' });
            }
        };
        friendshipSocket.addEventListener('message', handleMessage);
    });
}

function rejectFriendRequest(friendUsername) {
    if (!friendshipSocket || friendshipSocket.readyState !== WebSocket.OPEN) {
        console.error('WebSocket connection not open');
        return Promise.resolve({ error: 'WebSocket connection not open' });
    }
    friendshipSocket.send(JSON.stringify({
        type: 'reject_friend_request',
        friend_username: friendUsername
    }));
    return new Promise((resolve) => {
        const handleMessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'friend_request_rejected' && data.friend_username === friendUsername) {
                friendshipSocket.removeEventListener('message', handleMessage);
                resolve({ message: data.message || 'Friend request rejected successfully' });
            } else if (data.type === 'friend_request_error' && data.friend_username === friendUsername) {
                friendshipSocket.removeEventListener('message', handleMessage);
                resolve({ error: data.error || 'Failed to reject friend request' });
            }
        };
        friendshipSocket.addEventListener('message', handleMessage);
    });
}

function cancelFriendRequest(friendUsername) {
    if (!friendshipSocket || friendshipSocket.readyState !== WebSocket.OPEN) {
        console.error('WebSocket connection not open');
        return Promise.resolve({ error: 'WebSocket connection not open' });
    }
    friendshipSocket.send(JSON.stringify({
        type: 'cancel_friend_request',
        friend_username: friendUsername
    }));
    return new Promise((resolve) => {
        const handleMessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'friend_request_cancelled' && data.friend_username === friendUsername) {
                friendshipSocket.removeEventListener('message', handleMessage);
                resolve({ message: data.message || 'Friend request cancelled successfully' });
            } else if (data.type === 'friend_request_error' && data.friend_username === friendUsername) {
                friendshipSocket.removeEventListener('message', handleMessage);
                resolve({ error: data.error || 'Failed to cancel friend request' });
            }
        };
        friendshipSocket.addEventListener('message', handleMessage);
    });
}

function isConnected() {
    return friendshipSocket && friendshipSocket.readyState === WebSocket.OPEN;
}

function closeConnection() {
    if (friendshipSocket) {
        friendshipSocket.close();
        friendshipSocket = null;
        console.log('Friendship WebSocket connection closed manually');
    }
}

export {
    initializeWebSocket,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
    isConnected,
    closeConnection,
    friendshipSocket
};