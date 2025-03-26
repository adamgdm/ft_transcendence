import { initializeWebSocket, sendFriendRequest, acceptFriendRequest, rejectFriendRequest, cancelFriendRequest, isConnected, closeConnection, friendshipSocket } from "./globalWebsocket.js";
import { game } from "./pages/game/game.js";
import { home } from "./pages/home/home.js";
import { setupMatchModes } from "./pages/play/play.js";
import { users } from "./pages/users/users.js";
import { settings } from "./pages/settings/settings.js";
import { storyActions } from "./pages/story/index.js";
import { scrollAction } from "./pages/story/scroll.js";

const authenticatedPages = ['home', 'settings', 'shop', 'play', 'game', 'users'];

// Friend-related state
let pendingSentRequests = new Set();
let pendingReceivedRequests = new Map();
let friendsList = new Set();

// Game-related state
let allFriends = [];
let sentInvites = [];
let receivedInvites = [];
let tournamentId = null;
let invitedFriends = new Set();
let participantCount = 1;

// WebSocket disconnect tracking
let disconnectCount = 0;

// Store cleanup functions for each page
const pageCleanups = new Map();

// Verify JWT token with the server
async function verifyToken() {
    try {
        const response = await fetch('/api/verifyToken', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include' // Include cookies (JWT likely in HTTP-only cookie)
        });
        if (response.status === 200) {
            console.log('Token verified successfully');
            return true;
        } else if (response.status === 401) {
            console.error('401 Unauthorized in verifyToken, token invalid or expired');
            return false;
        } else {
            console.error(`Unexpected response in verifyToken: ${response.status}`);
            return false;
        }
    } catch (error) {
        console.error('Error verifying token:', error);
        return false;
    }
}

async function fetchUsers(query) {
    try {
        const response = await fetch(`api/search_users/?query=${encodeURIComponent(query)}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });
        if (response.status === 401) {
            console.error('401 Unauthorized in fetchUsers, redirecting to story');
            localStorage.setItem('isAuthenticated', 'false');
            window.isAuthenticated = false;
            window.location.hash = 'story';
            routeToPage('story');
            throw new Error('Unauthorized');
        }
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data = await response.json();
        return data.users || [];
    } catch (error) {
        console.error('Error fetching users:', error);
        return [];
    }
}

async function fetchPendingReceivedRequests() {
    try {
        const response = await fetch('api/get_friend_requests/', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });
        if (response.status === 401) {
            console.error('401 Unauthorized in fetchPendingReceivedRequests, redirecting to story');
            localStorage.setItem('isAuthenticated', 'false');
            window.isAuthenticated = false;
            window.location.hash = 'story';
            routeToPage('story');
            throw new Error('Unauthorized');
        }
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data = await response.json();
        return data.requests || [];
    } catch (error) {
        console.error('Error fetching received requests:', error);
        return [];
    }
}

async function fetchPendingSentRequests() {
    try {
        const response = await fetch('api/get_sent_friend_requests/', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });
        if (response.status === 401) {
            console.error('401 Unauthorized in fetchPendingSentRequests, redirecting to story');
            localStorage.setItem('isAuthenticated', 'false');
            window.isAuthenticated = false;
            window.location.hash = 'story';
            routeToPage('story');
            throw new Error('Unauthorized');
        }
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data = await response.json();
        return data.sent_requests || [];
    } catch (error) {
        console.error('Error fetching sent requests:', error);
        return [];
    }
}

async function fetchPendingGameInvites() {
    try {
        const response = await fetch('api/get_game_invites/', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });
        if (response.status === 401) {
            console.error('401 Unauthorized in fetchPendingGameInvites, redirecting to story');
            localStorage.setItem('isAuthenticated', 'false');
            window.isAuthenticated = false;
            window.location.hash = 'story';
            routeToPage('story');
            throw new Error('Unauthorized');
        }
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data = await response.json();
        return data.invites || [];
    } catch (error) {
        console.error('Error fetching game invites:', error);
        return [];
    }
}

async function fetchFriendsList() {
    try {
        const response = await fetch('api/get_friends/', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });
        if (response.status === 401) {
            console.error('401 Unauthorized in fetchFriendsList, redirecting to story');
            localStorage.setItem('isAuthenticated', 'false');
            window.isAuthenticated = false;
            window.location.hash = 'story';
            routeToPage('story');
            throw new Error('Unauthorized');
        }
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data = await response.json();
        allFriends = data.friends || [];
        return allFriends;
    } catch (error) {
        console.error('Error fetching friends list:', error);
        return [];
    }
}

async function fetchLogin() {
    try {
        const response = await fetch('api/profile/', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });
        if (response.status === 401) {
            console.error('401 Unauthorized in fetchLogin, redirecting to story');
            localStorage.setItem('isAuthenticated', 'false');
            window.isAuthenticated = false;
            window.location.hash = 'story';
            routeToPage('story');
            throw new Error('Unauthorized');
        }
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data = await response.json();
        return data.user_name;
    } catch (error) {
        console.error('Error fetching username:', error);
        return null;
    }
}

async function removeFriend(username) {
    try {
        const response = await fetch('api/remove_friend/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ friend_username: username })
        });
        if (response.status === 401) {
            console.error('401 Unauthorized in removeFriend, redirecting to story');
            localStorage.setItem('isAuthenticated', 'false');
            window.isAuthenticated = false;
            window.location.hash = 'story';
            routeToPage('story');
            throw new Error('Unauthorized');
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error removing friend:', error);
        return { error: 'Network error' };
    }
}

async function sendGameInvite(toUsername, gameMode = 'online', tournamentId = null) {
    if (!isConnected()) {
        console.error('WebSocket not connected, cannot send game invite');
        return false;
    }
    friendshipSocket.send(JSON.stringify({
        type: 'send_game_invite',
        to_username: toUsername,
        game_mode: gameMode,
        tournament_id: tournamentId
    }));
    return true;
}

async function acceptGameInvite(inviteId) {
    if (!isConnected()) {
        console.error('WebSocket not connected, cannot accept game invite');
        return false;
    }
    friendshipSocket.send(JSON.stringify({
        type: 'accept_game_invite',
        invite_id: inviteId
    }));
    return true;
}

async function rejectGameInvite(inviteId) {
    if (!isConnected()) {
        console.error('WebSocket not connected, cannot reject game invite');
        return false;
    }
    friendshipSocket.send(JSON.stringify({
        type: 'reject_game_invite',
        invite_id: inviteId
    }));
    return true;
}

async function handleAuthStateChange() {
    window.isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
    console.log('handleAuthStateChange: isAuthenticated=', window.isAuthenticated);
    if (window.isAuthenticated) {
        await initializeWebSocket(); // Ensure WebSocket is initialized
        if (isConnected()) {
            await syncStateWithWebSocket();
        } else {
            console.warn('WebSocket failed to connect in handleAuthStateChange, using fallback');
            await fetchAndSyncStateFallback();
        }
    } else {
        closeConnection();
    }
}

function forceLogout() {
    window.isAuthenticated = false;
    localStorage.setItem('isAuthenticated', 'false');
    localStorage.removeItem('username');
    closeConnection();
    window.location.hash = 'story';
    routeToPage('story');
}

window.routeToPage = function (path, options = {}) {
    console.log(`Routing to ${path} with options:`, options);
    if (!isValidRoute(path)) {
        console.log('Invalid route, loading 404');
        loadPage('404');
        return;
    }

    if (authenticatedPages.includes(path) && !window.isAuthenticated) {
        console.log('User not authenticated, redirecting to story');
        window.location.hash = 'story';
        return;
    }

    if (path === 'story' && window.isAuthenticated) {
        console.log('Authenticated user on story, redirecting to home');
        window.location.hash = 'home';
        return;
    }

    if (window.isAuthenticated && !isConnected()) {
        console.log('WebSocket not connected, reinitializing...');
        initializeWebSocket().then(() => {
            if (isConnected()) {
                syncStateWithWebSocket();
            } else {
                console.warn('WebSocket reconnection failed, proceeding anyway');
            }
        }).catch(err => console.error('WebSocket reinitialization failed:', err));
    }

    cleanupPreviousPage();
    if (authenticatedPages.includes(path)) {
        console.log('Loading authenticated layout for:', path);
        loadAuthenticatedLayout(path, options);
    } else {
        console.log('Loading non-authenticated page:', path);
        loadPage(path);
    }
};

async function handleHashChange(fragId) {
    if (fragId.startsWith('users=')) {
        const username = fragId.split('=')[1];
        const userProfile = await fetchUserProfile(username);

        if (userProfile.error) {
            window.location.hash = 'home';
            routeToPage('home');
            layoutShowError(userProfile.error, false);
        } else {
            routeToPage('users');
        }
    } else if (fragId === 'users') {
        window.location.hash = 'home';
        routeToPage('home');
        layoutShowError('no user found', false);
    } else {
        routeToPage(fragId);
    }
}

window.onload = async function () {
    const fragId = window.location.hash.substring(1) || 'story';
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code) {
        // OAuth flow (unchanged)
        try {
            const response = await fetch('/api/oauth2/login/redirect/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
                credentials: 'include',
            });

            if (response.status === 401) {
                console.error('401 Unauthorized in OAuth login, redirecting to story');
                forceLogout();
                throw new Error('Unauthorized');
            }
            if (!response.ok) throw new Error(`Login failed: ${response.status}`);
            const data = await response.json();
            console.log('Login successful:', data);

            localStorage.setItem('isAuthenticated', 'true');
            localStorage.setItem('username', data.user_name); // Store username
            window.isAuthenticated = true;

            await initializeWebSocket();
            if (isConnected()) {
                await syncStateWithWebSocket();
            } else {
                console.warn('WebSocket not connected after OAuth login, using fallback');
                await fetchAndSyncStateFallback();
            }

            window.location.hash = 'home';
            const currentUrl = new URL(window.location);
            currentUrl.searchParams.delete('code');
            window.history.replaceState({}, '', currentUrl.toString());
            routeToPage('home');
        } catch (error) {
            console.error('Login error:', error);
            alert('Login failed: ' + error.message);
            forceLogout();
        }
    } else {
        const isLocalAuth = localStorage.getItem('isAuthenticated') === 'true';
        if (isLocalAuth) {
            const isTokenValid = await verifyToken();
            if (isTokenValid) {
                const username = await fetchLogin();
                if (username) {
                    window.isAuthenticated = true;
                    localStorage.setItem('username', username); // Ensure username is set
                    console.log('Session validated via token, user:', username);

                    await initializeWebSocket();
                    if (isConnected()) {
                        await syncStateWithWebSocket();
                    } else {
                        console.warn('WebSocket not connected on page load, using fallback');
                        await fetchAndSyncStateFallback();
                    }
                    routeToPage(fragId || 'home', history.state || {});
                } else {
                    console.log('Token valid but fetchLogin failed, forcing logout');
                    forceLogout();
                }
            } else {
                console.log('Token invalid or expired, forcing logout');
                forceLogout();
            }
        } else {
            console.log('Not authenticated, skipping WebSocket initialization');
            routeToPage('story');
        }
    }

    window.addEventListener('hashchange', () => {
        const path = window.location.hash.substring(1) || 'story';
        const state = history.state || {};
        routeToPage(path, { username: state.username });
    });
};

function showNotification(message) {
    const notificationContainer = document.createElement('div');
    notificationContainer.classList.add('notification');
    notificationContainer.style.cssText = `
        position: fixed; top: 10px; right: 10px; background: #333; color: white;
        padding: 10px; border-radius: 5px; z-index: 1000; max-width: 300px;
    `;
    notificationContainer.textContent = message;
    document.body.appendChild(notificationContainer);
    setTimeout(() => notificationContainer.remove(), 5000);
}

async function syncStateWithWebSocket() {
    return new Promise((resolve) => {
        console.log('syncStateWithWebSocket: Setting up listener');

        Promise.all([
            fetchPendingSentRequests(),
            fetchPendingReceivedRequests(),
            fetchPendingGameInvites(),
            fetchFriendsList()
        ]).then(([sentRequests, receivedRequests, gameInvites, friends]) => {
            pendingSentRequests.clear();
            sentRequests.forEach(req => pendingSentRequests.add(req.to_username));

            pendingReceivedRequests.clear();
            receivedRequests.forEach(req => pendingReceivedRequests.set(req.request_id, req.from_username));

            receivedInvites = gameInvites.map(invite => ({
                invite_id: invite.invite_id,
                from_username: invite.from_username,
                status: 'pending',
                tournament_id: invite.game_mode === 'tournament' ? invite.game_id : null,
                game_mode: invite.game_mode
            }));

            friendsList.clear();
            friends.forEach(friend => friendsList.add(friend.username));

            console.log('Initial state synced:', {
                pendingSentRequests: [...pendingSentRequests],
                pendingReceivedRequests: [...pendingReceivedRequests.entries()],
                receivedInvites: [...receivedInvites],
                friendsList: [...friendsList]
            });

            for (let [requestId, fromUsername] of pendingReceivedRequests) {
                showNotification(`New friend request from ${fromUsername}`);
            }
            for (let invite of receivedInvites) {
                showNotification(`New game invite from ${invite.from_username}`);
            }

            triggerUIUpdate();
            resolve();
        }).catch(err => {
            console.error('Error syncing initial state:', err);
            resolve();
        });

        friendshipSocket.addEventListener('close', () => {
            disconnectCount++;
            console.log(`WebSocket disconnected, count: ${disconnectCount}`);
            if (disconnectCount > 2) {
                console.error('WebSocket disconnected more than twice, redirecting to story');
                window.location.hash = 'story';
                routeToPage('story');
            }
        });

        friendshipSocket.addEventListener('message', async (event) => {
            const data = JSON.parse(event.data);
            console.log('Received:', data);
            if (data.type === 'ping') return;

            const currentUsername = await fetchLogin();
            const updateEvent = new CustomEvent('gameStateUpdate', { 
                detail: { sentInvites, receivedInvites, tournamentId, participantCount, invitedFriends } 
            });

            switch (data.type) {
                case 'pending_friend_requests':
                    pendingReceivedRequests.clear();
                    data.requests.forEach(req => {
                        pendingReceivedRequests.set(req.request_id, req.from_username);
                        showNotification(`Friend request from ${req.from_username}`);
                    });
                    console.log('Pending friend requests loaded:', [...pendingReceivedRequests.entries()]);
                    triggerUIUpdate();
                    break;
                case 'pending_game_invites':
                    receivedInvites = data.invites.map(invite => ({
                        invite_id: invite.invite_id,
                        from_username: invite.from_username,
                        status: 'pending',
                        tournament_id: invite.game_mode === 'tournament' ? invite.game_id : null,
                        game_mode: invite.game_mode
                    }));
                    console.log('Pending game invites loaded:', [...receivedInvites]);
                    for (let invite of receivedInvites) {
                        showNotification(`New game invite from ${invite.from_username}`);
                    }
                    triggerUIUpdate();
                    break;
                case 'friend_request_sent':
                    pendingSentRequests.add(data.friend_username);
                    triggerUIUpdate();
                    break;
                case 'friend_request_accepted':
                    for (let [requestId, fromUsername] of pendingReceivedRequests) {
                        if (fromUsername === data.friend_username) {
                            pendingReceivedRequests.delete(requestId);
                            break;
                        }
                    }
                    friendsList.add(data.friend_username);
                    triggerUIUpdate();
                    break;
                case 'friend_request_cancelled':
                    pendingSentRequests.delete(data.friend_username);
                    console.log(`Cancelled request to ${data.friend_username}, updated pendingSentRequests:`, [...pendingSentRequests]);
                    triggerUIUpdate();
                    break;
                case 'friend_request_cancelled_notification':
                    for (let [requestId, fromUsername] of pendingReceivedRequests) {
                        if (fromUsername === data.friend_username) {
                            pendingReceivedRequests.delete(requestId);
                            console.log(`Received cancellation from ${data.friend_username}, updated pendingReceivedRequests:`, [...pendingReceivedRequests.entries()]);
                            break;
                        }
                    }
                    triggerUIUpdate();
                    break;
                case 'new_friend_request_notification':
                    pendingReceivedRequests.set(data.request_id, data.from_username);
                    showNotification(`New friend request from ${data.from_username}`);
                    console.log(`New friend request from ${data.from_username} (ID: ${data.request_id})`);
                    triggerUIUpdate();
                    break;
                case 'game_invite_sent':
                    sentInvites.push({ 
                        to_username: data.to_username, 
                        invite_id: data.invite_id, 
                        status: 'pending', 
                        tournament_id: data.tournament_id || null, 
                        game_mode: data.game_mode || 'online' 
                    });
                    triggerUIUpdate();
                    break;
                case 'new_game_invite_notification':
                    receivedInvites.push({ 
                        invite_id: data.invite_id, 
                        from_username: data.from_username, 
                        status: 'pending', 
                        tournament_id: data.tournament_id || null, 
                        game_mode: data.game_mode || 'online' 
                    });
                    showNotification(`New game invite from ${data.from_username}`);
                    console.log(`New game invite from ${data.from_username} (ID: ${data.invite_id})`);
                    triggerUIUpdate();
                    break;
                case 'game_invite_accepted':
                    const sentInvite = sentInvites.find(i => i.invite_id === data.invite_id);
                    if (sentInvite) {
                        sentInvite.status = 'accepted';
                        sentInvite.game_id = data.game_id;
                        if (sentInvite.game_mode !== 'tournament') {
                            history.pushState({ game_id: data.game_id, user: currentUsername }, "", "#game");
                            window.routeToPage('game');
                        }
                    }
                    triggerUIUpdate();
                    break;
                case 'game_invite_accepted_notification':
                    const receivedInvite = receivedInvites.find(i => i.invite_id === data.invite_id);
                    if (receivedInvite) {
                        receivedInvite.status = 'accepted';
                        receivedInvite.game_id = data.game_id;
                        if (receivedInvite.game_mode !== 'tournament') {
                            history.pushState({ game_id: data.game_id, user: currentUsername, from_username: receivedInvite.from_username, to_username: data.to_username }, "", "#game");
                            window.routeToPage('game');
                        }
                    }
                    triggerUIUpdate();
                    break;
                case 'game_invite_rejected':
                    sentInvites = sentInvites.filter(i => i.invite_id !== data.invite_id);
                    triggerUIUpdate();
                    break;
                case 'game_invite_rejected_notification':
                    receivedInvites = receivedInvites.filter(i => i.invite_id !== data.invite_id);
                    triggerUIUpdate();
                    break;
                case 'local_game_created':
                    if (data.user === currentUsername) {
                        history.pushState({ game_id: data.game_id, user: currentUsername, from_username: currentUsername, to_username: null, game_mode: 'local' }, "", "#game");
                        window.routeToPage('game');
                    }
                    break;
                case 'tournament_created':
                    tournamentId = data.tournament_id;
                    invitedFriends = new Set(data.invited_usernames);
                    participantCount = 1;
                    triggerUIUpdate();
                    break;
                case 'tournament_invite_accepted':
                    if (data.tournament_id === tournamentId) participantCount++;
                    const acceptedInvite = receivedInvites.find(i => i.invite_id === data.invite_id);
                    if (acceptedInvite) acceptedInvite.status = 'accepted';
                    triggerUIUpdate();
                    break;
                case 'tournament_waiting':
                    if (data.tournament_id === tournamentId) {
                        participantCount = data.participant_count;
                        alert(`Waiting for more players: ${participantCount}/4`);
                    }
                    triggerUIUpdate();
                    break;
                case 'tournament_match_start':
                    if (currentUsername === data.player_1 || currentUsername === data.player_2) {
                        const state = { game_id: data.game_id, user: currentUsername, from_username: data.player_1, to_username: data.player_2, game_mode: 'online', tournament_id: data.tournament_id };
                        history.pushState(state, "", `#game/${data.game_id}`);
                        window.routeToPage('game', { gameId: data.game_id });
                    }
                    triggerUIUpdate();
                    break;
                case 'tournament_completed':
                    alert(`Tournament ${data.tournament_id} completed! Champion: ${data.champion}`);
                    resetTournamentState();
                    triggerUIUpdate();
                    break;
                case 'tournament_error':
                    console.error(`Tournament error: ${data.error}`);
                    alert(`Tournament error: ${data.error}`);
                    if (data.tournament_id === tournamentId) resetTournamentState();
                    triggerUIUpdate();
                    break;
            }
            window.dispatchEvent(updateEvent);
        });
    });
}

async function fetchAndSyncStateFallback() {
    const [sentRequests, receivedRequests, gameInvites, friends] = await Promise.all([
        fetchPendingSentRequests(),
        fetchPendingReceivedRequests(),
        fetchPendingGameInvites(),
        fetchFriendsList()
    ]);

    pendingSentRequests.clear();
    sentRequests.forEach(req => pendingSentRequests.add(req.to_username));

    pendingReceivedRequests.clear();
    receivedRequests.forEach(req => pendingReceivedRequests.set(req.request_id, req.from_username));

    receivedInvites = gameInvites.map(invite => ({
        invite_id: invite.invite_id,
        from_username: invite.from_username,
        status: 'pending',
        tournament_id: invite.game_mode === 'tournament' ? invite.game_id : null,
        game_mode: invite.game_mode
    }));

    friendsList.clear();
    friends.forEach(friend => friendsList.add(friend.username));

    console.log('Fallback state synced:', {
        pendingSentRequests: [...pendingSentRequests],
        pendingReceivedRequests: [...pendingReceivedRequests.entries()],
        receivedInvites: [...receivedInvites],
        friendsList: [...friendsList]
    });

    triggerUIUpdate();
}

function triggerUIUpdate() {
    const currentPath = window.location.hash.substring(1) || 'story';
    if (authenticatedPages.includes(currentPath) && !document.querySelector('.content-wrapper')) {
        loadAuthenticatedLayout(currentPath, history.state || {});
    }
    window.dispatchEvent(new CustomEvent('friendStateUpdate', {
        detail: {
            pendingSentRequests: [...pendingSentRequests],
            pendingReceivedRequests: [...pendingReceivedRequests.entries()],
            friendsList: [...friendsList]
        }
    }));
    window.dispatchEvent(new CustomEvent('gameStateUpdate', {
        detail: { sentInvites, receivedInvites, tournamentId, participantCount, invitedFriends }
    }));
}

function resetTournamentState() {
    tournamentId = null;
    invitedFriends.clear();
    participantCount = 1;
}

function isValidRoute(path) {
    const validRoutes = ['story', 'home', 'play', 'shop', 'settings', '404', 'game', 'users'];
    return validRoutes.includes(path);
}

function cleanupPreviousPage() {
    const currentPath = window.location.hash.substring(1) || 'story';
    const cleanup = pageCleanups.get(currentPath);
    if (cleanup) {
        console.log(`Cleaning up previous page: ${currentPath}`);
        cleanup();
        pageCleanups.delete(currentPath);
    }
}

function loadAuthenticatedLayout(contentPath, options = {}) {
    const content = document.getElementById('content');
    if (!content) {
        console.error('loadAuthenticatedLayout: Content element missing');
        return;
    }

    console.log('loadAuthenticatedLayout called with:', { contentPath, options });
    if (!document.querySelector('.layout-container')) {
        const layoutRequest = new XMLHttpRequest();
        layoutRequest.open('GET', 'layout/authenticated-layout.html', true);
        layoutRequest.onload = function () {
            if (layoutRequest.status === 200) {
                console.log('Authenticated layout loaded successfully');
                content.innerHTML = layoutRequest.responseText;
                loadContentIntoLayout(contentPath, options);
                setupSidebarNavigation();
                setupSearchBar();
                setupNotificationBar();
                setupLogoutButton();
            } else {
                console.error('Failed to load authenticated layout, status:', layoutRequest.status);
                loadPage('404');
            }
        };
        layoutRequest.onerror = function () {
            console.error('Error loading authenticated layout');
            loadPage('404');
        };
        layoutRequest.send();
    } else {
        console.log('Layout container exists, updating content');
        loadContentIntoLayout(contentPath, options);
        setupNotificationBar();
    }
}

function loadContentIntoLayout(path, options = {}) {
    const contentContainer = document.querySelector('.content-wrapper');
    if (!contentContainer) {
        console.error('loadContentIntoLayout: Content wrapper missing');
        return;
    }

    console.log('Loading content into layout for:', { path, options });
    contentContainer.style.opacity = '0';
    const request = new XMLHttpRequest();
    request.open('GET', `pages/${path}/${path}.html`, true);
    request.onload = function () {
        if (request.status === 200) {
            console.log(`Content loaded for ${path}`);
            contentContainer.innerHTML = request.responseText;
            updateStylesheet(`pages/${path}/${path}.css`);
            executePageScripts(path, options);
            contentContainer.style.opacity = '1';
        } else {
            console.error(`Failed to load content for ${path}, status:`, request.status);
            contentContainer.innerHTML = '<p>Error loading content</p>';
        }
    };
    request.onerror = function () {
        console.error(`Error loading content for ${path}`);
        contentContainer.innerHTML = '<p>Error loading content</p>';
    };
    request.send();
}

function setupSidebarNavigation() {
    const items = document.querySelectorAll('.sidebar-menu div, .sidebar-actions div');
    items.forEach(item => {
        item.removeEventListener('click', handleSidebarClick);
        item.addEventListener('click', handleSidebarClick);
    });

    function handleSidebarClick() {
        handleNotifBtn(this);
        const target = this.getAttribute('data-target');
        if (target) {
            if (target === '#story') {
                localStorage.setItem('isAuthenticated', 'false');
                window.isAuthenticated = false;
                handleAuthStateChange();
            }
            items.forEach(button => button.classList.remove('clicked'));
            this.classList.add('clicked');
            window.location.hash = target;
        }
    }

    pageCleanups.set('sidebar', () => {
        items.forEach(item => item.removeEventListener('click', handleSidebarClick));
    });
}

async function setupNotificationBar() {
    const notifBar = document.querySelector('[layout="notifbar"]');
    if (!notifBar) {
        console.warn('setupNotificationBar: Notification bar not found');
        return;
    }

    const renderNotifications = () => {
        notifBar.innerHTML = '';

        if (pendingReceivedRequests.size === 0 && receivedInvites.length === 0) {
            notifBar.innerHTML = '<p>No pending notifications</p>';
            return;
        }

        for (let [requestId, fromUsername] of pendingReceivedRequests) {
            const notifItem = document.createElement('div');
            notifItem.classList.add('notification-item');
            notifItem.innerHTML = `
                <span class="notif-text">${fromUsername} sent you a friend request.</span>
                <button class="accept-btn">Accept</button>
                <button class="decline-btn">Decline</button>
            `;

            const acceptBtn = notifItem.querySelector('.accept-btn');
            acceptBtn.onclick = async () => {
                await acceptFriendRequest(fromUsername);
                pendingReceivedRequests.delete(requestId);
                renderNotifications();
            };

            const declineBtn = notifItem.querySelector('.decline-btn');
            declineBtn.onclick = async () => {
                await rejectFriendRequest(fromUsername);
                pendingReceivedRequests.delete(requestId);
                renderNotifications();
            };

            notifBar.appendChild(notifItem);
        }

        for (let invite of receivedInvites.filter(i => i.status === 'pending')) {
            const notifItem = document.createElement('div');
            notifItem.classList.add('notification-item');
            notifItem.innerHTML = `
                <span class="notif-text">${invite.from_username} sent you a game invite.</span>
                <button class="accept-btn">Accept</button>
                <button class="decline-btn">Decline</button>
            `;

            const acceptBtn = notifItem.querySelector('.accept-btn');
            acceptBtn.onclick = async () => {
                await acceptGameInvite(invite.invite_id);
                renderNotifications();
            };

            const declineBtn = notifItem.querySelector('.decline-btn');
            declineBtn.onclick = async () => {
                await rejectGameInvite(invite.invite_id);
                renderNotifications();
            };

            notifBar.appendChild(notifItem);
        }
    };

    renderNotifications();

    window.addEventListener('friendStateUpdate', renderNotifications);
    window.addEventListener('gameStateUpdate', renderNotifications);

    pageCleanups.set('notificationBar', () => {
        window.removeEventListener('friendStateUpdate', renderNotifications);
        window.removeEventListener('gameStateUpdate', renderNotifications);
        console.log('Cleaned up notification bar');
    });
}

export async function fetchUserProfile(username) {
    const url = `/api/another_user_profile/?username=${encodeURIComponent(username)}`;
    const response = await fetch(url, {
        method: "GET",
        credentials: "include"
    });

    if (response.status === 401) {
        console.error('401 Unauthorized in fetchUserProfile, redirecting to story');
        localStorage.setItem('isAuthenticated', 'false');
        window.isAuthenticated = false;
        window.location.hash = 'story';
        routeToPage('story');
        return { error: 'Unauthorized' };
    }

    if (!response.ok) {
        if (response.status === 404) {
            console.log('User not found');
            return { error: 'User not found' };
        } else {
            throw new Error(`Failed to fetch user profile: ${response.statusText}`);
        }
    }

    const userData = await response.json();
    return userData;
}

export function layoutShowError(message, isSuccess = false) {
    const errorModal = document.querySelector("#errorContainer");
    const errorMessage = document.querySelector("#errorMessage");

    if (!errorModal || !errorMessage) {
        console.log("Error Modal or Message not found!");
        routeToPage('404');
        window.location.hash = '404';
        return;
    }

    errorMessage.textContent = message;

    errorModal.classList.remove("success", "failure");

    if (isSuccess) {
        errorModal.classList.add("success");
    } else {
        errorModal.classList.add("failure");
    }

    errorModal.style.opacity = "1";
    errorModal.style.visibility = 'visible';

    setTimeout(() => {
        errorModal.style.opacity = "0";
        errorModal.style.visibility = 'hidden';
        errorModal.style.transition = "opacity 0.3s ease-in-out, visibility 0.3s ease-in-out";
    }, 3000);
}

async function setupSearchBar() {
    const searchInput = document.getElementById('search-bar');
    if (!searchInput) {
        console.error('setupSearchBar: Search input #search-bar not found');
        return;
    }
    console.log('setupSearchBar: Search input found');

    const navbarSearch = document.querySelector('.navbar-search');
    if (!navbarSearch) {
        console.error('setupSearchBar: .navbar-search container not found');
        return;
    }
    const userSuggestionsBox = document.createElement('div');
    userSuggestionsBox.classList.add('user-suggestions');
    navbarSearch.appendChild(userSuggestionsBox);
    console.log('setupSearchBar: Suggestions box appended to .navbar-search');

    const [sentRequests, receivedRequests, friends] = await Promise.all([
        fetchPendingSentRequests(),
        fetchPendingReceivedRequests(),
        fetchFriendsList()
    ]);

    pendingSentRequests.clear();
    sentRequests.forEach(req => pendingSentRequests.add(req.to_username));
    pendingReceivedRequests.clear();
    receivedRequests.forEach(req => pendingReceivedRequests.set(req.request_id, req.from_username));
    friendsList.clear();
    friends.forEach(friend => friendsList.add(friend.username));

    const debounce = (func, wait) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    };

    const renderSuggestion = (user, suggestionDiv) => {
        suggestionDiv.innerHTML = `<span class="username">${user.username}</span>`;
        suggestionDiv.dataset.username = user.username;

        if (friendsList.has(user.username)) {
            suggestionDiv.innerHTML += `<button class="remove-btn">Remove</button>`;
            const removeBtn = suggestionDiv.querySelector('.remove-btn');
            removeBtn.onclick = async (e) => {
                e.stopPropagation();
                const result = await removeFriend(user.username);
                if (!result.error) {
                    friendsList.delete(user.username);
                    handleSearchInput();
                }
            };
        } else if ([...pendingReceivedRequests.values()].includes(user.username)) {
            suggestionDiv.innerHTML += `<button class="accept-btn">Accept</button>`;
            const acceptBtn = suggestionDiv.querySelector('.accept-btn');
            acceptBtn.onclick = async (e) => {
                e.stopPropagation();
                await acceptFriendRequest(user.username);
                handleSearchInput();
            };
        } else if (pendingSentRequests.has(user.username)) {
            suggestionDiv.innerHTML += `<span class="sent-label">Sent!</span>`;
        } else {
            suggestionDiv.innerHTML += `<button class="add-btn">Add</button>`;
            const addBtn = suggestionDiv.querySelector('.add-btn');
            addBtn.onclick = async (e) => {
                e.stopPropagation();
                const success = await sendFriendRequest(user.username);
                if (success) {
                    pendingSentRequests.add(user.username);
                    renderSuggestion(user, suggestionDiv);
                }
            };
        }
    };

    const handleSearchInput = debounce(async () => {
        const query = searchInput.value.trim().toLowerCase();
        console.log('handleSearchInput: Query:', query);
        userSuggestionsBox.innerHTML = '';
        if (query.length === 0) {
            userSuggestionsBox.style.display = 'none';
            return;
        }

        const users = await fetchUsers(query);
        console.log('handleSearchInput: Fetched users:', users);
        if (users.length === 0) {
            userSuggestionsBox.style.display = 'none';
            return;
        }

        users.slice(0, 3).forEach(user => {
            const suggestionDiv = document.createElement('div');
            suggestionDiv.classList.add('suggestion-item');
            renderSuggestion(user, suggestionDiv);
            userSuggestionsBox.appendChild(suggestionDiv);
            console.log('handleSearchInput: Added suggestion for', user.username);
        });
        userSuggestionsBox.style.display = 'block';
    }, 300);

    userSuggestionsBox.addEventListener('click', (e) => {
        console.log('userSuggestionsBox clicked:', e.target);
        const suggestionItem = e.target.closest('.suggestion-item');
        if (suggestionItem) {
            if (e.target.tagName === 'BUTTON') {
                console.log('Clicked a button, skipping routing');
                return;
            }
            const username = suggestionItem.dataset.username;
            console.log('Suggestion item clicked, username:', username);
            history.pushState({ username: username }, "", "#users");
            console.log('History state after push:', history.state);
            window.routeToPage('users', { username: username });
            console.log('RouteToPage called with:', { path: 'users', options: { username: username } });
            userSuggestionsBox.style.display = 'none';
        } else {
            console.log('Click outside suggestion-item, no action taken');
        }
    });

    searchInput.addEventListener('input', handleSearchInput);
    window.addEventListener('friendStateUpdate', handleSearchInput);
    document.addEventListener('click', handleOutsideClick);

    function handleOutsideClick(event) {
        if (!navbarSearch.contains(event.target)) {
            userSuggestionsBox.style.display = 'none';
        }
    }

    pageCleanups.set('search', () => {
        searchInput.removeEventListener('input', handleSearchInput);
        window.removeEventListener('friendStateUpdate', handleSearchInput);
        document.removeEventListener('click', handleOutsideClick);
        userSuggestionsBox.removeEventListener('click', () => {});
        userSuggestionsBox.remove();
        console.log('Cleaned up search bar');
    });
}

function handleNotifBtn(item) {
    const notifBar = document.querySelector('[layout="notifbar"]');
    if (item.classList.contains('notif')) {
        notifBar.classList.toggle('active');
        if (!notifBar.classList.contains('active')) {
            item.classList.remove('clicked');
        }
    } else {
        notifBar.classList.remove('active');
        item.classList.remove('clicked');
    }
}

function loadPage(path) {
    const content = document.getElementById('content');
    const request = new XMLHttpRequest();
    request.open('GET', `pages/${path}/${path}.html`, true);
    request.onload = function () {
        if (request.status === 200) {
            content.innerHTML = request.responseText;
            updateStylesheet(`pages/${path}/${path}.css`);
            executePageScripts(path);
        } else {
            loadPage('404');
        }
    };
    request.onerror = function () {
        loadPage('404');
    };
    request.send();
}

function updateStylesheet(href) {
    let linkTag = document.querySelector("link[data-section-style]");
    if (!linkTag) {
        linkTag = document.createElement("link");
        linkTag.rel = "stylesheet";
        linkTag.dataset.sectionStyle = "true";
        document.head.appendChild(linkTag);
    }
    linkTag.href = href;
}

function setupLogoutButton() {
    const logoutBtn = document.querySelector('#logoutBtn');
    if (!logoutBtn) {
        console.warn('setupLogoutButton: #logoutBtn not found');
        return;
    }

    const handleLogout = async () => {
        try {
            const response = await fetch('/api/logout/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            });

            if (response.status === 401) {
                console.error('401 Unauthorized in logout, redirecting to story');
                localStorage.setItem('isAuthenticated', 'false');
                window.isAuthenticated = false;
                window.location.hash = 'story';
                routeToPage('story');
                throw new Error('Unauthorized');
            }
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || `Logout failed: ${response.status}`);
            }
            console.log(data.message || 'Logout successful');

            if (isConnected()) {
                closeConnection();
                console.log('WebSocket disconnected due to logout');
            }

            window.isAuthenticated = false;
            localStorage.setItem('isAuthenticated', 'false');
            window.location.hash = 'story';
            routeToPage('story');
        } catch (error) {
            console.error('Error during logout:', error);
            alert('Logout failed: ' + error.message);
        }
    };

    logoutBtn.addEventListener('click', handleLogout);

    pageCleanups.set('logout', () => {
        logoutBtn.removeEventListener('click', handleLogout);
        console.log('setupLogoutButton: Cleaned up');
    });
}

function executePageScripts(path, options = {}) {
    console.log('Executing scripts for:', path, 'with options:', options);
    let cleanup;
    switch (path) {
        case "story":
            storyActions();
            scrollAction();
            cleanup = () => console.log('Cleaned up story page');
            break;
        case "play":
            setupMatchModes().then(cleanupFn => cleanup = cleanupFn);
            break;
        case "home":
            cleanup = home();
            break;
        case "settings":
            settings();
            cleanup = () => console.log('Cleaned up settings page');
            break;
        case "game":
            game();
            cleanup = () => console.log('Cleaned up game page');
            break;
        case "users":
            console.log('Calling users script with username:', options.username);
            cleanup = users(options.username);
            break;
    }
    if (cleanup) pageCleanups.set(path, cleanup);
}

export { 
    handleAuthStateChange, 
    fetchFriendsList, 
    fetchLogin, 
    sentInvites, 
    receivedInvites, 
    tournamentId, 
    invitedFriends, 
    participantCount, 
    friendsList, 
    removeFriend, 
    pageCleanups,
    sendGameInvite,
    acceptGameInvite,
    rejectGameInvite,
    verifyToken // Export for potential reuse
};