import { initializeWebSocket, sendFriendRequest, acceptFriendRequest, rejectFriendRequest, cancelFriendRequest, isConnected, closeConnection, friendshipSocket } from "./globalWebsocket.js";
import { game } from "./pages/game/game.js";
import { home } from "./pages/home/home.js";
import { flip } from "./pages/play/play.js";
import { settings } from "./pages/settings/settings.js";
import { storyActions } from "./pages/story/index.js";
import { scrollAction } from "./pages/story/scroll.js";

const authenticatedPages = ['home', 'settings', 'shop', 'play', 'game'];

// Friend-related state
let pendingSentRequests = new Set();
let pendingReceivedRequests = new Map(); // Using Map to store request_id and from_username
let friendsList = new Set();

// Game-related state
let allFriends = [];
let sentInvites = [];
let receivedInvites = [];
let tournamentId = null;
let invitedFriends = new Set();
let participantCount = 1;

// Store cleanup functions for each page
const pageCleanups = new Map();

async function fetchUsers(query) {
    try {
        const response = await fetch(`api/search_users/?query=${encodeURIComponent(query)}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });
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
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data = await response.json();
        return data.sent_requests || [];
    } catch (error) {
        console.error('Error fetching sent requests:', error);
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
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error removing friend:', error);
        return { error: 'Network error' };
    }
}

function handleAuthStateChange() {
    window.isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
    console.log('handleAuthStateChange: isAuthenticated=', window.isAuthenticated);
    if (window.isAuthenticated) {
        initializeWebSocket().then(() => {
            if (isConnected()) {
                syncStateWithWebSocket();
            } else {
                console.warn('WebSocket failed to connect in handleAuthStateChange');
            }
        }).catch(err => console.error('WebSocket initialization failed:', err));
    } else {
        closeConnection();
    }
}

window.routeToPage = function (path, options = {}) {
    console.log(`Routing to ${path}`);
    if (!isValidRoute(path)) {
        loadPage('404');
        return;
    }

    if (authenticatedPages.includes(path) && !window.isAuthenticated) {
        window.location.hash = 'story';
        return;
    }

    if (path === 'story' && window.isAuthenticated) {
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
        loadAuthenticatedLayout(path);
    } else {
        loadPage(path);
    }
};

window.onload = async function () {
    const fragId = window.location.hash.substring(1) || 'story';
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code) {
        // Handle OAuth login
        try {
            const response = await fetch('/api/oauth2/login/redirect/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
                credentials: 'include',
            });

            if (!response.ok) throw new Error(`Login failed: ${response.status}`);
            const data = await response.json();
            console.log('Login successful:', data);

            localStorage.setItem('isAuthenticated', 'true');
            window.isAuthenticated = true;

            // Wait for WebSocket and state sync before routing
            await initializeWebSocket();
            if (isConnected()) {
                await syncStateWithWebSocket();
                console.log('WebSocket connected and state synced after OAuth login');
            } else {
                console.warn('WebSocket not connected after login, using API fallback');
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
            window.isAuthenticated = false;
            localStorage.setItem('isAuthenticated', 'false');
            routeToPage('story');
        }
    } else {
        // Handle page load/refresh
        const isLocalAuth = localStorage.getItem('isAuthenticated') === 'true';
        if (isLocalAuth) {
            const username = await fetchLogin();
            if (username) {
                window.isAuthenticated = true;
                console.log('Session validated, user:', username);

                // Wait for WebSocket and state sync before routing
                await initializeWebSocket();
                if (isConnected()) {
                    await syncStateWithWebSocket();
                    console.log('WebSocket connected and state synced on page load');
                } else {
                    console.warn('WebSocket not connected on page load, using API fallback');
                    await fetchAndSyncStateFallback();
                }
                routeToPage(fragId);
            } else {
                console.log('Session invalid, forcing logout');
                window.isAuthenticated = false;
                localStorage.setItem('isAuthenticated', 'false');
                routeToPage('story');
            }
        } else {
            console.log('Not authenticated, skipping WebSocket initialization');
            routeToPage('story');
        }
    }

    window.addEventListener('hashchange', () => {
        const path = window.location.hash.substring(1) || 'story';
        routeToPage(path);
    });
};

// Simple function to display popup notifications
function showNotification(message) {
    const notificationContainer = document.createElement('div');
    notificationContainer.classList.add('notification');
    notificationContainer.style.cssText = `
        position: fixed; top: 10px; right: 10px; background: #333; color: white;
        padding: 10px; border-radius: 5px; z-index: 1000; max-width: 300px;
    `;
    notificationContainer.textContent = message;
    document.body.appendChild(notificationContainer);
    setTimeout(() => notificationContainer.remove(), 5000); // Remove after 5 seconds
}

async function syncStateWithWebSocket() {
    return new Promise((resolve) => {
        console.log('syncStateWithWebSocket: Setting up listener');

        // Fetch initial state from server
        Promise.all([
            fetchPendingSentRequests(),
            fetchPendingReceivedRequests(),
            fetchFriendsList()
        ]).then(([sentRequests, receivedRequests, friends]) => {
            // Reset state and populate from server
            pendingSentRequests.clear();
            sentRequests.forEach(req => pendingSentRequests.add(req.to_username));

            pendingReceivedRequests.clear();
            receivedRequests.forEach(req => pendingReceivedRequests.set(req.request_id, req.from_username));

            friendsList.clear();
            friends.forEach(friend => friendsList.add(friend.username));

            console.log('Initial state synced:', {
                pendingSentRequests: [...pendingSentRequests],
                pendingReceivedRequests: [...pendingReceivedRequests.entries()],
                friendsList: [...friendsList]
            });

            // Show initial pending requests as popup notifications
            for (let [requestId, fromUsername] of pendingReceivedRequests) {
                showNotification(`New friend request from ${fromUsername}`);
            }

            // Trigger UI update after initial sync
            triggerUIUpdate();

            // Resolve the promise once initial sync is complete
            resolve();
        }).catch(err => {
            console.error('Error syncing initial state:', err);
            resolve(); // Resolve even on error to avoid hanging
        });

        // Set up WebSocket listener for real-time updates
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
                    sentInvites.push({ to_username: data.to_username, invite_id: data.invite_id, status: 'pending', tournament_id: data.tournament_id || null, game_mode: data.game_mode || 'online' });
                    break;
                case 'new_game_invite_notification':
                    receivedInvites.push({ invite_id: data.invite_id, from_username: data.from_username, status: 'pending', tournament_id: data.tournament_id || null, game_mode: data.game_mode || 'online' });
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
                    break;
                case 'game_invite_accepted_notification':
                    const receivedInvite = receivedInvites.find(i => i.invite_id === data.invite_id);
                    if (receivedInvite && receivedInvite.game_mode !== 'tournament') {
                        receivedInvite.status = 'accepted';
                        receivedInvite.game_id = data.game_id;
                        history.pushState({ game_id: data.game_id, user: currentUsername, from_username: receivedInvite.from_username, to_username: data.to_username }, "", "#game");
                        window.routeToPage('game');
                    }
                    break;
                case 'game_invite_rejected':
                    sentInvites = sentInvites.filter(i => i.invite_id !== data.invite_id);
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
                    break;
                case 'tournament_invite_accepted':
                    if (data.tournament_id === tournamentId) participantCount++;
                    const acceptedInvite = receivedInvites.find(i => i.invite_id === data.invite_id);
                    if (acceptedInvite) acceptedInvite.status = 'accepted';
                    break;
                case 'tournament_waiting':
                    if (data.tournament_id === tournamentId) {
                        participantCount = data.participant_count;
                        alert(`Waiting for more players: ${participantCount}/4`);
                    }
                    break;
                case 'tournament_match_start':
                    if (currentUsername === data.player_1 || currentUsername === data.player_2) {
                        const state = { game_id: data.game_id, user: currentUsername, from_username: data.player_1, to_username: data.player_2, game_mode: 'online', tournament_id: data.tournament_id };
                        history.pushState(state, "", `#game/${data.game_id}`);
                        window.routeToPage('game', { gameId: data.game_id });
                    }
                    break;
                case 'tournament_completed':
                    alert(`Tournament ${data.tournament_id} completed! Champion: ${data.champion}`);
                    resetTournamentState();
                    break;
                case 'tournament_error':
                    console.error(`Tournament error: ${data.error}`);
                    alert(`Tournament error: ${data.error}`);
                    if (data.tournament_id === tournamentId) resetTournamentState();
                    break;
            }
            window.dispatchEvent(updateEvent);
        });
    });
}

async function fetchAndSyncStateFallback() {
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

    console.log('Fallback state synced:', {
        pendingSentRequests: [...pendingSentRequests],
        pendingReceivedRequests: [...pendingReceivedRequests.entries()],
        friendsList: [...friendsList]
    });

    // Trigger UI update
    triggerUIUpdate();
}

function triggerUIUpdate() {
    const currentPath = window.location.hash.substring(1) || 'story';
    if (authenticatedPages.includes(currentPath)) {
        loadAuthenticatedLayout(currentPath); // Reload the layout with updated state
    }
    // Dispatch a custom event to notify components
    window.dispatchEvent(new CustomEvent('friendStateUpdate', {
        detail: {
            pendingSentRequests: [...pendingSentRequests],
            pendingReceivedRequests: [...pendingReceivedRequests.entries()],
            friendsList: [...friendsList]
        }
    }));
}

function resetTournamentState() {
    tournamentId = null;
    invitedFriends.clear();
    participantCount = 1;
}

function isValidRoute(path) {
    const validRoutes = ['story', 'home', 'play', 'shop', 'settings', '404', 'game'];
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

function loadAuthenticatedLayout(contentPath) {
    const content = document.getElementById('content');
    if (!content) {
        console.error('loadAuthenticatedLayout: Content element missing');
        return;
    }

    if (!document.querySelector('.layout-container')) {
        const layoutRequest = new XMLHttpRequest();
        layoutRequest.open('GET', 'layout/authenticated-layout.html', true);
        layoutRequest.onload = function () {
            if (layoutRequest.status === 200) {
                content.innerHTML = layoutRequest.responseText;
                loadContentIntoLayout(contentPath);
                setupSidebarNavigation();
                setupSearchBar();
                setupNotificationBar(); // Add notification bar setup
                setupLogoutButton();
            } else {
                loadPage('404');
            }
        };
        layoutRequest.onerror = function () {
            loadPage('404');
        };
        layoutRequest.send();
    } else {
        loadContentIntoLayout(contentPath);
        setupNotificationBar(); // Ensure notification bar is updated on reload
    }
}

function loadContentIntoLayout(path) {
    const contentContainer = document.querySelector('.content-wrapper');
    if (!contentContainer) {
        console.error('loadContentIntoLayout: Content wrapper missing');
        return;
    }

    contentContainer.style.opacity = '0';
    const request = new XMLHttpRequest();
    request.open('GET', `pages/${path}/${path}.html`, true);
    request.onload = function () {
        if (request.status === 200) {
            contentContainer.innerHTML = request.responseText;
            updateStylesheet(`pages/${path}/${path}.css`);
            executePageScripts(path);
            contentContainer.style.opacity = '1';
        } else {
            contentContainer.innerHTML = '<p>Error loading content</p>';
        }
    };
    request.onerror = function () {
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
        notifBar.innerHTML = ''; // Clear existing content
        if (pendingReceivedRequests.size === 0) {
            notifBar.innerHTML = '<p>No pending friend requests</p>';
            return;
        }

        for (let [requestId, fromUsername] of pendingReceivedRequests) {
            const notifItem = document.createElement('div');
            notifItem.classList.add('notification-item');
            notifItem.style.cssText = `
                display: flex; justify-content: space-between; align-items: center;
                padding: 10px; border-bottom: 1px solid #444; color: white;
            `;
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
    };

    // Initial render
    renderNotifications();

    // Listen for state updates
    window.addEventListener('friendStateUpdate', renderNotifications);

    // Cleanup
    pageCleanups.set('notificationBar', () => {
        window.removeEventListener('friendStateUpdate', renderNotifications);
        console.log('Cleaned up notification bar');
    });
}

async function setupSearchBar() {
    const searchInput = document.getElementById('search-bar');
    if (!searchInput) return;
    const userSuggestionsBox = document.createElement('div');
    userSuggestionsBox.classList.add('user-suggestions');
    const navbarSearch = document.querySelector('.navbar-search');
    navbarSearch.appendChild(userSuggestionsBox);

    // Initial state fetch
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
        suggestionDiv.innerHTML = `<span>${user.username}</span>`;
        const span = suggestionDiv.querySelector('span');
        span.addEventListener('click', () => {
            searchInput.value = user.username;
            userSuggestionsBox.style.display = 'none';
        });

        if (friendsList.has(user.username)) {
            suggestionDiv.innerHTML += `<button class="remove-btn">Remove</button>`;
            suggestionDiv.querySelector('.remove-btn').onclick = async (e) => {
                e.stopPropagation();
                const result = await removeFriend(user.username);
                if (!result.error) {
                    friendsList.delete(user.username);
                    handleSearchInput();
                }
            };
        } else if ([...pendingReceivedRequests.values()].includes(user.username)) {
            suggestionDiv.innerHTML += `<button class="accept-btn">Accept</button>`;
            suggestionDiv.querySelector('.accept-btn').onclick = async (e) => {
                e.stopPropagation();
                await acceptFriendRequest(user.username);
                handleSearchInput();
            };
        } else if (pendingSentRequests.has(user.username)) {
            suggestionDiv.innerHTML += `<span class="sent-label">Sent!</span>`;
        } else {
            suggestionDiv.innerHTML += `<button class="add-btn">Add</button>`;
            suggestionDiv.querySelector('.add-btn').onclick = async (e) => {
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
        userSuggestionsBox.innerHTML = '';
        if (query.length === 0) {
            userSuggestionsBox.style.display = 'none';
            return;
        }

        const users = await fetchUsers(query);
        users.slice(0, 3).forEach(user => {
            const suggestionDiv = document.createElement('div');
            suggestionDiv.classList.add('suggestion-item');
            renderSuggestion(user, suggestionDiv);
            userSuggestionsBox.appendChild(suggestionDiv);
        });
        userSuggestionsBox.style.display = users.length ? 'block' : 'none';
    }, 300);

    searchInput.addEventListener('input', handleSearchInput);

    // Listen for friend state updates
    window.addEventListener('friendStateUpdate', () => {
        handleSearchInput(); // Re-render suggestions based on updated state
    });

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
        userSuggestionsBox.remove();
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

    const cleanup = () => {
        logoutBtn.removeEventListener('click', handleLogout);
        console.log('setupLogoutButton: Cleaned up');
    };

    pageCleanups.set('logout', cleanup);
}

function executePageScripts(path) {
    console.log('Executing scripts for:', path);
    let cleanup;
    switch (path) {
        case "story":
            storyActions();
            scrollAction();
            cleanup = () => {
                console.log('Cleaned up story page');
            };
            break;
        case "play":
            flip().then(cleanupFn => {
                cleanup = cleanupFn;
            });
            break;
        case "home":
            cleanup = home();
            break;
        case "settings":
            settings();
            cleanup = () => {
                console.log('Cleaned up settings page');
            };
            break;
        case "game":
            game();
            cleanup = () => {
                console.log('Cleaned up game page');
            };
            break;
    }
    if (cleanup) pageCleanups.set(path, cleanup);
}

export { handleAuthStateChange, fetchFriendsList, fetchLogin, sentInvites, receivedInvites, tournamentId, invitedFriends, participantCount, friendsList, removeFriend, pageCleanups };