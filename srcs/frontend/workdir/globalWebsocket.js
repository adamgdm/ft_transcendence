let friendshipSocket = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 500; // Start at 0.5s, increase with backoff
let currentUsername = localStorage.getItem('username') || null;
let pendingNotifications = [];
let sentInvites = new Map();
let pendingActions = []; // Queue for actions when not connected

function initializeWebSocket() {
    console.log('initializeWebSocket: Starting...');
    if (friendshipSocket && friendshipSocket.readyState === WebSocket.OPEN) {
        console.log('initializeWebSocket: Already connected, skipping');
        return Promise.resolve();
    }

    if (friendshipSocket) {
        friendshipSocket.onopen = null;
        friendshipSocket.onclose = null;
        friendshipSocket.onerror = null;
        friendshipSocket.onmessage = null;
        friendshipSocket.close();
        friendshipSocket = null;
        console.log('initializeWebSocket: Closed stale connection');
    }

    currentUsername = localStorage.getItem('username') || null; // Refresh username
    if (!currentUsername) {
        console.warn('initializeWebSocket: No username in localStorage, may fail authentication');
    }

    const wHost = window.location.host;
    const wsUrl = `wss://${wHost}/ws/friendship/`;
    console.log('initializeWebSocket: Connecting to:', wsUrl);

    friendshipSocket = new WebSocket(wsUrl);

    return new Promise((resolve, reject) => {
        friendshipSocket.onopen = () => {
            console.log('initializeWebSocket: Connection opened successfully');
            reconnectAttempts = 0;
            processPendingActions();
            resolve();
        };

        friendshipSocket.onclose = (e) => {
            console.log('initializeWebSocket: Connection closed:', { code: e.code, reason: e.reason });
            friendshipSocket = null;
            if (localStorage.getItem('isAuthenticated') === 'true' && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts);
                console.log(`initializeWebSocket: Scheduling reconnect in ${delay}ms (attempt ${reconnectAttempts + 1})`);
                setTimeout(() => {
                    reconnectAttempts++;
                    initializeWebSocket();
                }, delay);
            } else {
                console.log('initializeWebSocket: Not authenticated or max attempts reached, no reconnect');
            }
        };

        friendshipSocket.onerror = (error) => {
            console.error('initializeWebSocket: Error:', error);
            reject(error);
            if (friendshipSocket) {
                friendshipSocket.close();
            }
        };

        friendshipSocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type && (data.type.includes('notification') || data.type.includes('pending'))) {
                    pendingNotifications.push(data);
                    processNotifications();
                }

                if (data.type === 'game_invite_accepted') {
                    const state = {
                        game_id: data.game_id,
                        from_username: data.from_username || sentInvites.get(String(data.invite_id))?.from_username || null,
                        to_username: data.to_username || currentUsername,
                        game_mode: data.game_mode || sentInvites.get(String(data.invite_id))?.game_mode || 'online',
                        user: currentUsername,
                        invite_id: data.invite_id
                    };
                    window.location.hash = 'game';
                    window.history.replaceState(state, '', '#game');
                    window.routeToPage('game');
                }

                if (data.type === 'game_invite_accepted_notification') {
                    const inviteIdStr = String(data.invite_id);
                    if (sentInvites.has(inviteIdStr)) {
                        const inviteDetails = sentInvites.get(inviteIdStr);
                        const state = {
                            game_id: data.game_id,
                            from_username: currentUsername,
                            to_username: data.to_username,
                            game_mode: inviteDetails.game_mode || 'online',
                            user: currentUsername,
                            invite_id: data.invite_id
                        };
                        window.location.hash = 'game';
                        window.history.replaceState(state, '', '#game');
                        window.routeToPage('game');
                        sentInvites.delete(inviteIdStr);
                    }
                }

                if (data.type === 'game_invite_sent') {
                    sentInvites.set(String(data.invite_id), {
                        from_username: currentUsername,
                        to_username: data.to_username,
                        game_mode: data.game_mode || 'online'
                    });
                }

                window.dispatchEvent(new CustomEvent('websocketMessage', { detail: data }));
            } catch (error) {
                console.error('onmessage: Error parsing message:', error);
            }
        };
    });
}

function processPendingActions() {
    while (pendingActions.length > 0) {
        const { action, resolve, reject } = pendingActions.shift();
        try {
            action().then(resolve).catch(reject);
        } catch (error) {
            reject(error);
        }
    }
}

function queueAction(action) {
    return new Promise((resolve, reject) => {
        if (isConnected()) {
            action().then(resolve).catch(reject);
        } else {
            console.log('queueAction: WebSocket not connected, queuing action');
            pendingActions.push({ action, resolve, reject });
            initializeWebSocket(); // Trigger connection attempt
        }
    });
}

// Modified action functions to use queueing
function sendFriendRequest(friendUsername) {
    const action = () => {
        friendshipSocket.send(JSON.stringify({
            type: 'send_friend_request',
            friend_username: friendUsername
        }));
        return new Promise((resolve) => {
            const handleMessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'friend_request_sent' && data.friend_username === friendUsername) {
                    friendshipSocket.removeEventListener('message', handleMessage);
                    resolve({ message: data.message || 'Friend request sent' });
                } else if (data.type === 'friend_request_error' && data.friend_username === friendUsername) {
                    friendshipSocket.removeEventListener('message', handleMessage);
                    resolve({ error: data.error || 'Failed to send friend request' });
                }
            };
            friendshipSocket.addEventListener('message', handleMessage);
        });
    };
    return queueAction(action);
}

function acceptFriendRequest(friendUsername) {
    const action = () => {
        friendshipSocket.send(JSON.stringify({
            type: 'accept_friend_request',
            friend_username: friendUsername
        }));
        return new Promise((resolve) => {
            const handleMessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'friend_request_accepted' && data.friend_username === friendUsername) {
                    friendshipSocket.removeEventListener('message', handleMessage);
                    resolve({ message: data.message || 'Friend request accepted' });
                } else if (data.type === 'friend_request_error' && data.friend_username === friendUsername) {
                    friendshipSocket.removeEventListener('message', handleMessage);
                    resolve({ error: data.error || 'Failed to accept friend request' });
                }
            };
            friendshipSocket.addEventListener('message', handleMessage);
        });
    };
    return queueAction(action);
}

function rejectFriendRequest(friendUsername) {
    const action = () => {
        friendshipSocket.send(JSON.stringify({
            type: 'reject_friend_request',
            friend_username: friendUsername
        }));
        return new Promise((resolve) => {
            const handleMessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'friend_request_rejected' && data.friend_username === friendUsername) {
                    friendshipSocket.removeEventListener('message', handleMessage);
                    resolve({ message: data.message || 'Friend request rejected' });
                } else if (data.type === 'friend_request_error' && data.friend_username === friendUsername) {
                    friendshipSocket.removeEventListener('message', handleMessage);
                    resolve({ error: data.error || 'Failed to reject friend request' });
                }
            };
            friendshipSocket.addEventListener('message', handleMessage);
        });
    };
    return queueAction(action);
}

function cancelFriendRequest(friendUsername) {
    const action = () => {
        friendshipSocket.send(JSON.stringify({
            type: 'cancel_friend_request',
            friend_username: friendUsername
        }));
        return new Promise((resolve) => {
            const handleMessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'friend_request_cancelled' && data.friend_username === friendUsername) {
                    friendshipSocket.removeEventListener('message', handleMessage);
                    resolve({ message: data.message || 'Friend request cancelled' });
                } else if (data.type === 'friend_request_error' && data.friend_username === friendUsername) {
                    friendshipSocket.removeEventListener('message', handleMessage);
                    resolve({ error: data.error || 'Failed to cancel friend request' });
                }
            };
            friendshipSocket.addEventListener('message', handleMessage);
        });
    };
    return queueAction(action);
}

function sendGameInvite(toUsername, gameMode) {
    const action = () => {
        friendshipSocket.send(JSON.stringify({
            type: 'send_game_invite',
            to_username: toUsername,
            game_mode: gameMode || 'online'
        }));
        return new Promise((resolve) => {
            const handleMessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'game_invite_sent' && data.to_username === toUsername) {
                    sentInvites.set(String(data.invite_id), {
                        from_username: currentUsername,
                        to_username: toUsername,
                        game_mode: gameMode || 'online'
                    });
                    friendshipSocket.removeEventListener('message', handleMessage);
                    resolve({ message: data.message || 'Game invite sent', invite_id: data.invite_id });
                } else if (data.type === 'error' && data.to_username === toUsername) {
                    friendshipSocket.removeEventListener('message', handleMessage);
                    resolve({ error: data.message || 'Failed to send game invite' });
                }
            };
            friendshipSocket.addEventListener('message', handleMessage);
        });
    };
    return queueAction(action);
}

function acceptGameInvite(inviteId, fromUsername, gameMode) {
    const action = () => {
        friendshipSocket.send(JSON.stringify({
            type: 'accept_game_invite',
            invite_id: inviteId,
            from_username: fromUsername,
            game_mode: gameMode
        }));
        return new Promise((resolve) => {
            const handleMessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'game_invite_accepted' && data.invite_id === inviteId) {
                    friendshipSocket.removeEventListener('message', handleMessage);
                    resolve({ message: 'Game invite accepted' });
                } else if (data.type === 'error' && data.invite_id === inviteId) {
                    friendshipSocket.removeEventListener('message', handleMessage);
                    resolve({ error: data.message || 'Failed to accept game invite' });
                }
            };
            friendshipSocket.addEventListener('message', handleMessage);
        });
    };
    return queueAction(action);
}

function isConnected() {
    const connected = friendshipSocket && friendshipSocket.readyState === WebSocket.OPEN;
    console.log('isConnected:', connected);
    return connected;
}

function closeConnection() {
    console.log('closeConnection: Starting...');
    if (friendshipSocket && friendshipSocket.readyState !== WebSocket.CLOSED) {
        friendshipSocket.onopen = null;
        friendshipSocket.onclose = null;
        friendshipSocket.onerror = null;
        friendshipSocket.onmessage = null;
        friendshipSocket.close();
        friendshipSocket = null;
        reconnectAttempts = 0;
        pendingActions = [];
        console.log('closeConnection: Closed');
    }
}

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
                    notifContainer.innerHTML += `<div class="notif-item"><span class="notif-text">${data.from_username} accepted your friend request!</span></div>`;
                }
                break;
            case 'friend_request_rejected_notification':
                if (data.from_username !== currentUsername) {
                    notifContainer.innerHTML += `<div class="notif-item"><span class="notif-text">${data.from_username} rejected your friend request.</span></div>`;
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
                if (data.from_username !== currentUsername) {
                    notifContainer.innerHTML += `<div class="notif-item"><span class="notif-text">${data.from_username || 'Someone'} accepted your game invite!</span></div>`;
                }
                break;
            case 'game_invite_rejected_notification':
                if (data.from_username !== currentUsername) {
                    notifContainer.innerHTML += `<div class="notif-item"><span class="notif-text">${data.from_username} rejected your game invite.</span></div>`;
                }
                break;
            case 'pong':
                break;
            case 'error':
                console.error('processNotifications: Server error:', data.message);
                break;
            default:
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

    const acceptBtn = notifItem.querySelector('.accept-btn');
    const declineBtn = notifItem.querySelector('.decline-btn');

    const acceptHandler = async () => {
        const result = await acceptFriendRequest(fromUsername);
        if (!result.error) notifItem.remove();
        acceptBtn.removeEventListener('click', acceptHandler);
        declineBtn.removeEventListener('click', declineHandler);
    };

    const declineHandler = async () => {
        const result = await rejectFriendRequest(fromUsername);
        if (!result.error) notifItem.remove();
        acceptBtn.removeEventListener('click', acceptHandler);
        declineBtn.removeEventListener('click', declineHandler);
    };

    acceptBtn.addEventListener('click', acceptHandler);
    declineBtn.addEventListener('click', declineHandler);
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

    const acceptBtn = notifItem.querySelector('.accept-btn');
    const declineBtn = notifItem.querySelector('.decline-btn');

    const acceptHandler = () => {
        acceptGameInvite(inviteId, fromUsername, gameMode).then(result => {
            if (!result.error) notifItem.remove();
        });
        acceptBtn.removeEventListener('click', acceptHandler);
        declineBtn.removeEventListener('click', declineHandler);
    };

    const declineHandler = () => {
        if (isConnected()) {
            friendshipSocket.send(JSON.stringify({
                type: 'reject_game_invite',
                invite_id: inviteId
            }));
            notifItem.remove();
        }
        acceptBtn.removeEventListener('click', acceptHandler);
        declineBtn.removeEventListener('click', declineHandler);
    };

    acceptBtn.addEventListener('click', acceptHandler);
    declineBtn.addEventListener('click', declineHandler);
}

export {
    initializeWebSocket,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
    sendGameInvite,
    acceptGameInvite,
    isConnected,
    closeConnection,
    friendshipSocket
};