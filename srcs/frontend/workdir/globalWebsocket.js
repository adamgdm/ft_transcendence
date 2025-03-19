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
        }
    };

    friendshipSocket.onerror = (error) => {
        console.error('initializeWebSocket: Error:', error);
    };

    friendshipSocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('onmessage: Received:', data);

            // Queue notifications for UI updates
            if (data.type && (data.type.includes('notification') || data.type.includes('pending'))) {
                console.log('onmessage: Queuing notification:', data);
                pendingNotifications.push(data);
                processNotifications();
            }

            // Handle game invite acceptance for invitee
            if (data.type === 'game_invite_accepted') {
                console.log('onmessage: Game invite accepted detected:', data);
                const state = {
                    game_id: data.game_id,
                    from_username: data.from_username || sentInvites.get(data.invite_id.toString())?.from_username || null,
                    to_username: data.to_username || currentUsername,
                    game_mode: data.game_mode || sentInvites.get(data.invite_id.toString())?.game_mode || 'online',
                    user: currentUsername,
                    invite_id: data.invite_id
                };
                console.log(`onmessage: User ${currentUsername} navigating to #game, game_id: ${data.game_id}`);
                console.log('onmessage: Setting state:', state);
                window.location.hash = 'game';
                window.history.replaceState(state, "", "#game");
                window.routeToPage('game');
            }

            // Handle game invite acceptance notification for inviter
            if (data.type === 'game_invite_accepted_notification') {
                console.log('onmessage: Game invite accepted notification detected:', data);
                const isInviter = sentInvites.has(data.invite_id.toString());
                if (isInviter) {
                    const inviteDetails = sentInvites.get(data.invite_id.toString());
                    const state = {
                        game_id: data.game_id,
                        from_username: currentUsername, // Inviter is current user
                        to_username: data.to_username,
                        game_mode: inviteDetails.game_mode || 'online',
                        user: currentUsername,
                        invite_id: data.invite_id
                    };
                    console.log(`onmessage: Inviter ${currentUsername} navigating to #game, game_id: ${data.game_id}`);
                    console.log('onmessage: Setting state:', state);
                    window.location.hash = 'game';
                    window.history.replaceState(state, "", "#game");
                    window.routeToPage('game');
                    sentInvites.delete(data.invite_id.toString()); // Clean up
                }
            }

            // Track sent invites
            if (data.type === 'game_invite_sent') {
                console.log('onmessage: Tracking sent invite:', data);
                sentInvites.set(data.invite_id.toString(), {
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
    console.log('processNotifications: Starting, pending count:', pendingNotifications.length);
    const notifContainer = document.querySelector('[layout="notifbar"] .notif-container');
    if (!notifContainer) {
        console.log('processNotifications: No container found, skipping');
        return;
    }

    while (pendingNotifications.length > 0) {
        const data = pendingNotifications.shift();
        console.log('processNotifications: Processing:', data);

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
                console.log('processNotifications: Pong received');
                break;
            case 'error':
                console.error('processNotifications: Server error:', data.message);
                break;
            default:
                console.log('processNotifications: Unhandled type:', data.type);
        }
    }
}

function appendFriendRequestNotification(container, fromUsername) {
    console.log('appendFriendRequestNotification:', fromUsername);
    const notifItem = document.createElement('div');
    notifItem.className = 'notif-item';
    notifItem.innerHTML = `
        <span class="notif-text">${fromUsername} sent you a friend request.</span>
        <button class="accept-btn">Accept</button>
        <button class="decline-btn">Decline</button>
    `;
    container.appendChild(notifItem);

    notifItem.querySelector('.accept-btn').addEventListener('click', async () => {
        console.log('Accepting friend request from:', fromUsername);
        const result = await acceptFriendRequest(fromUsername);
        if (!result.error) notifItem.remove();
    });

    notifItem.querySelector('.decline-btn').addEventListener('click', async () => {
        console.log('Declining friend request from:', fromUsername);
        const result = await rejectFriendRequest(fromUsername);
        if (!result.error) notifItem.remove();
    });
}

function appendGameInviteNotification(container, fromUsername, gameMode, inviteId) {
    console.log('appendGameInviteNotification:', { fromUsername, gameMode, inviteId });
    const notifItem = document.createElement('div');
    notifItem.className = 'notif-item';
    notifItem.innerHTML = `
        <span class="notif-text">${fromUsername} invited you to a ${gameMode} game!</span>
        <button class="accept-btn">Accept</button>
        <button class="decline-btn">Decline</button>
    `;
    container.appendChild(notifItem);

    notifItem.querySelector('.accept-btn').addEventListener('click', () => {
        if (!friendshipSocket || friendshipSocket.readyState !== WebSocket.OPEN) {
            console.error('WebSocket not open, cannot accept invite');
            return;
        }
        console.log('Sending accept_game_invite for invite_id:', inviteId);
        friendshipSocket.send(JSON.stringify({
            type: 'accept_game_invite',
            invite_id: inviteId,
            from_username: fromUsername,
            game_mode: gameMode
        }));
        notifItem.remove();
    });

    notifItem.querySelector('.decline-btn').addEventListener('click', () => {
        if (!friendshipSocket || friendshipSocket.readyState !== WebSocket.OPEN) {
            console.error('WebSocket not open, cannot decline invite');
            return;
        }
        console.log('Sending reject_game_invite for invite_id:', inviteId);
        friendshipSocket.send(JSON.stringify({
            type: 'reject_game_invite',
            invite_id: inviteId
        }));
        notifItem.remove();
    });
}

function sendGameInvite(toUsername, gameMode) {
    console.log('sendGameInvite:', { toUsername, gameMode });
    if (!friendshipSocket || friendshipSocket.readyState !== WebSocket.OPEN) {
        console.error('WebSocket not open');
        return Promise.resolve({ error: 'WebSocket connection not open' });
    }
    friendshipSocket.send(JSON.stringify({
        type: 'send_game_invite',
        to_username: toUsername,
        game_mode: gameMode || 'online'
    }));
    return new Promise((resolve) => {
        const handleMessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'game_invite_sent' && data.to_username === toUsername) {
                console.log('sendGameInvite: Invite sent, tracking:', data);
                sentInvites.set(data.invite_id.toString(), {
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
        };
        friendshipSocket.addEventListener('message', handleMessage);
    });
}

function acceptGameInvite(inviteId, fromUsername, gameMode) {
    console.log('acceptGameInvite: Manual acceptance for invite_id:', inviteId);
    if (!friendshipSocket || friendshipSocket.readyState !== WebSocket.OPEN) {
        console.error('WebSocket not open, cannot accept invite');
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
            const data = JSON.parse(event.data);
            if (data.type === 'game_invite_accepted' && data.invite_id === inviteId) {
                console.log('acceptGameInvite: Accepted, received confirmation:', data);
                friendshipSocket.removeEventListener('message', handleMessage);
                resolve({ message: 'Game invite accepted' });
            } else if (data.type === 'error' && data.invite_id === inviteId) {
                console.error('acceptGameInvite: Error:', data.message);
                friendshipSocket.removeEventListener('message', handleMessage);
                resolve({ error: data.message || 'Failed to accept game invite' });
            }
        };
        friendshipSocket.addEventListener('message', handleMessage);
    });
}

function sendFriendRequest(friendUsername) {
    console.log('sendFriendRequest:', friendUsername);
    if (!friendshipSocket || friendshipSocket.readyState !== WebSocket.OPEN) {
        console.error('WebSocket not open');
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
                resolve({ message: data.message || 'Friend request sent' });
            } else if (data.type === 'friend_request_error' && data.friend_username === friendUsername) {
                friendshipSocket.removeEventListener('message', handleMessage);
                resolve({ error: data.error || 'Failed to send friend request' });
            }
        };
        friendshipSocket.addEventListener('message', handleMessage);
    });
}

function acceptFriendRequest(friendUsername) {
    console.log('acceptFriendRequest:', friendUsername);
    if (!friendshipSocket || friendshipSocket.readyState !== WebSocket.OPEN) {
        console.error('WebSocket not open');
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
                resolve({ message: data.message || 'Friend request accepted' });
            } else if (data.type === 'friend_request_error' && data.friend_username === friendUsername) {
                friendshipSocket.removeEventListener('message', handleMessage);
                resolve({ error: data.error || 'Failed to accept friend request' });
            }
        };
        friendshipSocket.addEventListener('message', handleMessage);
    });
}

function rejectFriendRequest(friendUsername) {
    console.log('rejectFriendRequest:', friendUsername);
    if (!friendshipSocket || friendshipSocket.readyState !== WebSocket.OPEN) {
        console.error('WebSocket not open');
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
                resolve({ message: data.message || 'Friend request rejected' });
            } else if (data.type === 'friend_request_error' && data.friend_username === friendUsername) {
                friendshipSocket.removeEventListener('message', handleMessage);
                resolve({ error: data.error || 'Failed to reject friend request' });
            }
        };
        friendshipSocket.addEventListener('message', handleMessage);
    });
}

function cancelFriendRequest(friendUsername) {
    console.log('cancelFriendRequest:', friendUsername);
    if (!friendshipSocket || friendshipSocket.readyState !== WebSocket.OPEN) {
        console.error('WebSocket not open');
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
                resolve({ message: data.message || 'Friend request cancelled' });
            } else if (data.type === 'friend_request_error' && data.friend_username === friendUsername) {
                friendshipSocket.removeEventListener('message', handleMessage);
                resolve({ error: data.error || 'Failed to cancel friend request' });
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