let friendshipSocket = null;
const RECONNECT_DELAY = 5000;
let currentUsername = localStorage.getItem('username') || null;
let pendingNotifications = [];
let sentInvites = new Map(); // Map invite_id to details for inviter tracking

function initializeWebSocket() {
    console.log('initializeWebSocket: Starting...');
    if (friendshipSocket && friendshipSocket.readyState === WebSocket.OPEN) {
        console.log('initializeWebSocket: Already connected, skipping');
        return;
    }

    // Clean up any existing connection
    if (friendshipSocket) {
        friendshipSocket.onopen = null;
        friendshipSocket.onclose = null;
        friendshipSocket.onerror = null;
        friendshipSocket.onmessage = null;
        friendshipSocket.close();
        friendshipSocket = null;
        console.log('initializeWebSocket: Closed stale connection');
    }

    const wHost = window.location.host;
    const wsUrl = `wss://${wHost}/ws/friendship/`;
    console.log('initializeWebSocket: Connecting to:', wsUrl);

    friendshipSocket = new WebSocket(wsUrl);

    friendshipSocket.onopen = () => {
        console.log('initializeWebSocket: Connection opened successfully');
    };

    friendshipSocket.onclose = (e) => {
        console.log('initializeWebSocket: Connection closed:', { code: e.code, reason: e.reason });
        friendshipSocket = null;
        if (localStorage.getItem('isAuthenticated') === 'true') {
            console.log(`initializeWebSocket: Scheduling reconnect in ${RECONNECT_DELAY}ms`);
            setTimeout(initializeWebSocket, RECONNECT_DELAY);
        } else {
            console.log('initializeWebSocket: Not authenticated, no reconnect scheduled');
        }
    };

    friendshipSocket.onerror = (error) => {
        console.error('initializeWebSocket: Error:', error);
        // Force close to trigger onclose and reconnect logic
        if (friendshipSocket) {
            friendshipSocket.close();
        }
    };

    friendshipSocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            // Queue notifications for UI updates
            if (data.type && (data.type.includes('notification') || data.type.includes('pending'))) {
                pendingNotifications.push(data);
                processNotifications();
            }

            // Handle game invite acceptance for invitee
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

            // Handle game invite acceptance notification for inviter
            if (data.type === 'game_invite_accepted_notification') {
                const inviteIdStr = String(data.invite_id);
                const isInviter = sentInvites.has(inviteIdStr);
                if (isInviter) {
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
                    sentInvites.delete(inviteIdStr); // Clean up
                }
            }

            // Track sent invites
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
}

function processNotifications() {
    const notifContainer = document.querySelector('[layout="notifbar"] .notif-container');
    if (!notifContainer) {
        return;
    }

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
        if (!friendshipSocket || friendshipSocket.readyState !== WebSocket.OPEN) {
            console.error('WebSocket not open, cannot accept invite');
            return;
        }
        friendshipSocket.send(JSON.stringify({
            type: 'accept_game_invite',
            invite_id: inviteId,
            from_username: fromUsername,
            game_mode: gameMode
        }));
        notifItem.remove();
        acceptBtn.removeEventListener('click', acceptHandler);
        declineBtn.removeEventListener('click', declineHandler);
    };

    const declineHandler = () => {
        if (!friendshipSocket || friendshipSocket.readyState !== WebSocket.OPEN) {
            console.error('WebSocket not open, cannot decline invite');
            return;
        }
        friendshipSocket.send(JSON.stringify({
            type: 'reject_game_invite',
            invite_id: inviteId
        }));
        notifItem.remove();
        acceptBtn.removeEventListener('click', acceptHandler);
        declineBtn.removeEventListener('click', declineHandler);
    };

    acceptBtn.addEventListener('click', acceptHandler);
    declineBtn.addEventListener('click', declineHandler);
}

function sendGameInvite(toUsername, gameMode) {
    if (!friendshipSocket || friendshipSocket.readyState !== WebSocket.OPEN) {
        console.error('sendGameInvite: WebSocket not open');
        return Promise.resolve({ error: 'WebSocket connection not open' });
    }
    friendshipSocket.send(JSON.stringify({
        type: 'send_game_invite',
        to_username: toUsername,
        game_mode: gameMode || 'online'
    }));
    return new Promise((resolve) => {
        const handleMessage = (event) => {
            try {
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
                    console.error('sendGameInvite: Error:', data.message);
                    friendshipSocket.removeEventListener('message', handleMessage);
                    resolve({ error: data.message || 'Failed to send game invite' });
                }
            } catch (error) {
                console.error('sendGameInvite: Error parsing message:', error);
            }
        };
        friendshipSocket.addEventListener('message', handleMessage);
    });
}

function acceptGameInvite(inviteId, fromUsername, gameMode) {
    if (!friendshipSocket || friendshipSocket.readyState !== WebSocket.OPEN) {
        console.error('acceptGameInvite: WebSocket not open, cannot accept invite');
        return Promise.resolve({ error: 'WebSocket connection not open' });
    }
    friendshipSocket.send(JSON.stringify({
        type: 'accept_game_invite',
        invite_id: inviteId,
        from_username: fromUsername,
        game_mode: gameMode
    }));
    return new Promise((resolve) => {
        const handleMessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'game_invite_accepted' && data.invite_id === inviteId) {
                    friendshipSocket.removeEventListener('message', handleMessage);
                    resolve({ message: 'Game invite accepted' });
                } else if (data.type === 'error' && data.invite_id === inviteId) {
                    console.error('acceptGameInvite: Error:', data.message);
                    friendshipSocket.removeEventListener('message', handleMessage);
                    resolve({ error: data.message || 'Failed to accept game invite' });
                }
            } catch (error) {
                console.error('acceptGameInvite: Error parsing message:', error);
            }
        };
        friendshipSocket.addEventListener('message', handleMessage);
    });
}

function sendFriendRequest(friendUsername) {
    if (!friendshipSocket || friendshipSocket.readyState !== WebSocket.OPEN) {
        console.error('sendFriendRequest: WebSocket not open');
        return Promise.resolve({ error: 'WebSocket connection not open' });
    }
    friendshipSocket.send(JSON.stringify({
        type: 'send_friend_request',
        friend_username: friendUsername
    }));
    return new Promise((resolve) => {
        const handleMessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'friend_request_sent' && data.friend_username === friendUsername) {
                    friendshipSocket.removeEventListener('message', handleMessage);
                    resolve({ message: data.message || 'Friend request sent' });
                } else if (data.type === 'friend_request_error' && data.friend_username === friendUsername) {
                    friendshipSocket.removeEventListener('message', handleMessage);
                    resolve({ error: data.error || 'Failed to send friend request' });
                }
            } catch (error) {
                console.error('sendFriendRequest: Error parsing message:', error);
            }
        };
        friendshipSocket.addEventListener('message', handleMessage);
    });
}

function acceptFriendRequest(friendUsername) {
    if (!friendshipSocket || friendshipSocket.readyState !== WebSocket.OPEN) {
        console.error('acceptFriendRequest: WebSocket not open');
        return Promise.resolve({ error: 'WebSocket connection not open' });
    }
    friendshipSocket.send(JSON.stringify({
        type: 'accept_friend_request',
        friend_username: friendUsername
    }));
    return new Promise((resolve) => {
        const handleMessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'friend_request_accepted' && data.friend_username === friendUsername) {
                    friendshipSocket.removeEventListener('message', handleMessage);
                    resolve({ message: data.message || 'Friend request accepted' });
                } else if (data.type === 'friend_request_error' && data.friend_username === friendUsername) {
                    friendshipSocket.removeEventListener('message', handleMessage);
                    resolve({ error: data.error || 'Failed to accept friend request' });
                }
            } catch (error) {
                console.error('acceptFriendRequest: Error parsing message:', error);
            }
        };
        friendshipSocket.addEventListener('message', handleMessage);
    });
}

function rejectFriendRequest(friendUsername) {
    if (!friendshipSocket || friendshipSocket.readyState !== WebSocket.OPEN) {
        console.error('rejectFriendRequest: WebSocket not open');
        return Promise.resolve({ error: 'WebSocket connection not open' });
    }
    friendshipSocket.send(JSON.stringify({
        type: 'reject_friend_request',
        friend_username: friendUsername
    }));
    return new Promise((resolve) => {
        const handleMessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'friend_request_rejected' && data.friend_username === friendUsername) {
                    friendshipSocket.removeEventListener('message', handleMessage);
                    resolve({ message: data.message || 'Friend request rejected' });
                } else if (data.type === 'friend_request_error' && data.friend_username === friendUsername) {
                    friendshipSocket.removeEventListener('message', handleMessage);
                    resolve({ error: data.error || 'Failed to reject friend request' });
                }
            } catch (error) {
                console.error('rejectFriendRequest: Error parsing message:', error);
            }
        };
        friendshipSocket.addEventListener('message', handleMessage);
    });
}

function cancelFriendRequest(friendUsername) {
    if (!friendshipSocket || friendshipSocket.readyState !== WebSocket.OPEN) {
        console.error('cancelFriendRequest: WebSocket not open');
        return Promise.resolve({ error: 'WebSocket connection not open' });
    }
    friendshipSocket.send(JSON.stringify({
        type: 'cancel_friend_request',
        friend_username: friendUsername
    }));
    return new Promise((resolve) => {
        const handleMessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'friend_request_cancelled' && data.friend_username === friendUsername) {
                    friendshipSocket.removeEventListener('message', handleMessage);
                    resolve({ message: data.message || 'Friend request cancelled' });
                } else if (data.type === 'friend_request_error' && data.friend_username === friendUsername) {
                    friendshipSocket.removeEventListener('message', handleMessage);
                    resolve({ error: data.error || 'Failed to cancel friend request' });
                }
            } catch (error) {
                console.error('cancelFriendRequest: Error parsing message:', error);
            }
        };
        friendshipSocket.addEventListener('message', handleMessage);
    });
}

function isConnected() {
    const connected = friendshipSocket && friendshipSocket.readyState === WebSocket.OPEN;
    console.log('isConnected:', connected);
    return connected;
}

function closeConnection() {
    console.log('closeConnection: Starting...');
    if (friendshipSocket) {
        friendshipSocket.onopen = null;
        friendshipSocket.onclose = null;
        friendshipSocket.onerror = null;
        friendshipSocket.onmessage = null;
        friendshipSocket.close();
        friendshipSocket = null;
        console.log('closeConnection: Closed');
    }
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