import { initializeWebSocket, sendFriendRequest, acceptFriendRequest, rejectFriendRequest, cancelFriendRequest, isConnected, closeConnection, friendshipSocket } from "./globalWebsocket.js";
import { game } from "./pages/game/game.js";
import { home } from "./pages/home/home.js";
import { flip } from "./pages/play/play.js";
import { settings } from "./pages/settings/settings.js";
import { storyActions } from "./pages/story/index.js";
import { scrollAction } from "./pages/story/scroll.js";

const authenticatedPages = ['home', 'settings', 'shop', 'play', 'game'];

window.isAuthenticated = localStorage.getItem('isAuthenticated') === 'true' || false;
console.log('Initial isAuthenticated:', window.isAuthenticated);

// Friend-related state
let pendingSentRequests = new Set();
let pendingReceivedRequests = new Set();
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

try {
    const savedSentRequests = localStorage.getItem('pendingFriendRequests');
    if (savedSentRequests) pendingSentRequests = new Set(JSON.parse(savedSentRequests));
    const savedReceivedRequests = localStorage.getItem('pendingReceivedRequests');
    if (savedReceivedRequests) pendingReceivedRequests = new Set(JSON.parse(savedReceivedRequests));
    const savedFriends = localStorage.getItem('friendsList');
    if (savedFriends) friendsList = new Set(JSON.parse(savedFriends));
    console.log('Loaded state:', { pendingSentRequests: [...pendingSentRequests], pendingReceivedRequests: [...pendingReceivedRequests], friendsList: [...friendsList] });
} catch (error) {
    console.error('Error loading from localStorage:', error);
}

function savePendingRequests() {
    try {
        localStorage.setItem('pendingFriendRequests', JSON.stringify([...pendingSentRequests]));
        localStorage.setItem('pendingReceivedRequests', JSON.stringify([...pendingReceivedRequests]));
    } catch (error) {
        console.error('Error saving pending requests:', error);
    }
}

function saveFriendsList() {
    try {
        localStorage.setItem('friendsList', JSON.stringify([...friendsList]));
    } catch (error) {
        console.error('Error saving friends list:', error);
    }
}

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

let cachedUsername = null;
async function fetchLogin() {
    if (cachedUsername) return cachedUsername;
    try {
        const response = await fetch('api/profile/', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        cachedUsername = (await response.json()).user_name;
        return cachedUsername;
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
        initializeWebSocket();
        syncStateWithWebSocket();
    } else {
        closeConnection();
    }
}

window.routeToPage = function (path, options = {}) {
    console.log(`Routing to ${path}`);
    if (!isValidRoute(path)) {
        console.log('routeToPage: Invalid route, loading 404');
        loadPage('404');
        return;
    }

    if (authenticatedPages.includes(path) && !window.isAuthenticated) {
        console.log('routeToPage: Unauthorized, redirecting to #story');
        window.location.hash = 'story';
        return;
    }

    if (path === 'story' && window.isAuthenticated) {
        console.log('routeToPage: Authenticated user on story, redirecting to #home');
        window.location.hash = 'home';
        return;
    }

    // Clean up previous page
    cleanupPreviousPage();

    if (authenticatedPages.includes(path)) {
        loadAuthenticatedLayout(path);
    } else {
        loadPage(path);
    }
};

window.onload = function () {
    const fragId = window.location.hash.substring(1) || 'story';
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code) {
        fetch('/api/oauth2/login/redirect/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
            credentials: 'include',
        })
        .then(response => {
            if (!response.ok) throw new Error(`Login failed: ${response.status}`);
            return response.json();
        })
        .then(data => {
            console.log('Login successful:', data);
            localStorage.setItem('isAuthenticated', 'true');
            window.isAuthenticated = true;
            initializeWebSocket();
            setTimeout(() => {
                if (isConnected()) {
                    window.location.hash = 'home';
                    const currentUrl = new URL(window.location);
                    currentUrl.searchParams.delete('code');
                    window.history.replaceState({}, '', currentUrl.toString());
                } else {
                    console.error('WebSocket not connected after login');
                    alert('Connection failed, please refresh');
                }
            }, 500);
        })
        .catch(error => {
            console.error('Login error:', error);
            alert('Login failed: ' + error.message);
        });
    } else {
        handleAuthStateChange();
        routeToPage(fragId);
    }

    window.addEventListener('hashchange', () => {
        const path = window.location.hash.substring(1) || 'story';
        routeToPage(path);
    });
};

function syncStateWithWebSocket() {
    console.log('syncStateWithWebSocket: Setting up listener');
    friendshipSocket.addEventListener('message', async (event) => {
        const data = JSON.parse(event.data);
        console.log('Received:', data);
        if (data.type === 'ping') return;

        const currentUsername = await fetchLogin();
        const updateEvent = new CustomEvent('gameStateUpdate', { detail: { sentInvites, receivedInvites, tournamentId, participantCount, invitedFriends } });

        switch (data.type) {
            case 'friend_request_sent':
                pendingSentRequests.add(data.friend_username);
                savePendingRequests();
                break;
            case 'friend_request_accepted':
                pendingReceivedRequests.delete(data.friend_username);
                friendsList.add(data.friend_username);
                savePendingRequests();
                saveFriendsList();
                break;
            case 'friend_request_rejected':
            case 'friend_request_cancelled':
                pendingSentRequests.delete(data.friend_username);
                savePendingRequests();
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
        item.removeEventListener('click', handleSidebarClick); // Remove old listeners
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

function setupFriendsModal() {
    let cleanup = () => {};
    const waitForButton = setInterval(() => {
        const seeFriendsBtn = document.querySelector(".see-friends-btn");
        if (seeFriendsBtn) {
            clearInterval(waitForButton);
            seeFriendsBtn.removeEventListener('click', handleFriendsClick); // Clean old listener
            seeFriendsBtn.addEventListener('click', handleFriendsClick);

            async function handleFriendsClick() {
                let friendsModal = document.getElementById("friends-modal");
                if (!friendsModal) {
                    friendsModal = document.createElement("div");
                    friendsModal.id = "friends-modal";
                    friendsModal.classList.add("friends-modal");
                    friendsModal.innerHTML = `
                        <button class="close-btn">×</button>
                        <div class="search-bar-container">
                            <input type="text" class="search-bar" placeholder="Search friends...">
                        </div>
                        <div class="friends-list"></div>
                    `;
                    document.body.appendChild(friendsModal);
                }

                const closeBtn = friendsModal.querySelector(".close-btn");
                const friendsListContainer = friendsModal.querySelector(".friends-list");
                const searchBar = friendsModal.querySelector(".search-bar");

                friendsModal.style.opacity = "1";
                friendsModal.style.visibility = "visible";

                const friends = await fetchFriendsList();
                friendsList = new Set(friends.map(f => f.username));
                saveFriendsList();
                renderFriends([...friendsList], friendsListContainer);

                closeBtn.removeEventListener('click', handleCloseClick);
                closeBtn.addEventListener('click', handleCloseClick);
                function handleCloseClick() {
                    friendsModal.style.opacity = "0";
                    friendsModal.style.visibility = "hidden";
                    searchBar.value = '';
                    renderFriends([...friendsList], friendsListContainer);
                }

                searchBar.removeEventListener('input', handleSearchInput);
                searchBar.addEventListener('input', handleSearchInput);
                function handleSearchInput() {
                    const query = searchBar.value.trim().toLowerCase();
                    const filteredFriends = [...friendsList].filter(friend => friend.toLowerCase().startsWith(query));
                    renderFriends(filteredFriends, friendsListContainer);
                }

                cleanup = () => {
                    closeBtn.removeEventListener('click', handleCloseClick);
                    searchBar.removeEventListener('input', handleSearchInput);
                    if (friendsModal) {
                        friendsModal.style.opacity = "0";
                        friendsModal.style.visibility = "hidden";
                    }
                };
            }
        }
    }, 100);

    setTimeout(() => {
        clearInterval(waitForButton);
        console.error('setupFriendsModal: Timed out waiting for .see-friends-btn');
    }, 5000);

    function renderFriends(friends, container) {
        container.innerHTML = '';
        if (!Array.isArray(friends) || friends.length === 0) {
            container.innerHTML = '<p>No friends found.</p>';
            return;
        }
        friends.forEach((friend) => {
            const username = typeof friend === 'string' ? friend : friend.username;
            const friendItem = document.createElement('div');
            friendItem.classList.add('friend-item');
            friendItem.innerHTML = `
                <img src="https://cdn-icons-png.flaticon.com/512/147/147144.png" alt="${username} image">
                <p>${username}</p>
                <button class="remove-friend">Remove Friend</button>
            `;
            const removeBtn = friendItem.querySelector('.remove-friend');
            removeBtn.removeEventListener('click', handleRemoveClick); // Clean old listener
            removeBtn.addEventListener('click', handleRemoveClick);
            async function handleRemoveClick(e) {
                e.stopPropagation();
                const result = await removeFriend(username);
                if (!result.error) {
                    friendsList.delete(username);
                    saveFriendsList();
                    renderFriends([...friendsList].filter(f => f.toLowerCase().startsWith(container.parentElement.querySelector('.search-bar').value.trim().toLowerCase())), container);
                }
            }
            container.appendChild(friendItem);
        });
    }

    pageCleanups.set('play', cleanup); // Assuming this is tied to 'play' page
}

document.addEventListener("DOMContentLoaded", setupFriendsModal);

function setupSearchBar() {
    const searchInput = document.getElementById('search-bar');
    if (!searchInput) return; // Skip if not present
    const userSuggestionsBox = document.createElement('div');
    userSuggestionsBox.classList.add('user-suggestions');
    const navbarSearch = document.querySelector('.navbar-search');
    navbarSearch.appendChild(userSuggestionsBox);

    const debounce = (func, wait) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
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
                        saveFriendsList();
                        handleSearchInput();
                    }
                };
            } else if (pendingReceivedRequests.has(user.username)) {
                suggestionDiv.innerHTML += `<button class="accept-btn">Accept</button><button class="ignore-btn">Ignore</button>`;
                suggestionDiv.querySelector('.accept-btn').onclick = async (e) => {
                    e.stopPropagation();
                    await acceptFriendRequest(user.username);
                    handleSearchInput();
                };
                suggestionDiv.querySelector('.ignore-btn').onclick = async (e) => {
                    e.stopPropagation();
                    await rejectFriendRequest(user.username);
                    handleSearchInput();
                };
            } else if (pendingSentRequests.has(user.username)) {
                suggestionDiv.innerHTML += `<button class="cancel-btn">Cancel</button>`;
                suggestionDiv.querySelector('.cancel-btn').onclick = async (e) => {
                    e.stopPropagation();
                    await cancelFriendRequest(user.username);
                    handleSearchInput();
                };
            } else {
                suggestionDiv.innerHTML += `<button class="add-btn">Add</button>`;
                suggestionDiv.querySelector('.add-btn').onclick = async (e) => {
                    e.stopPropagation();
                    await sendFriendRequest(user.username);
                    handleSearchInput();
                };
            }
            userSuggestionsBox.appendChild(suggestionDiv);
        });
        userSuggestionsBox.style.display = users.length ? 'block' : 'none';
    }, 300);

    searchInput.removeEventListener('input', handleSearchInput);
    searchInput.addEventListener('input', handleSearchInput);
    document.removeEventListener('click', handleOutsideClick);
    document.addEventListener('click', handleOutsideClick);
    function handleOutsideClick(event) {
        if (!navbarSearch.contains(event.target)) {
            userSuggestionsBox.style.display = 'none';
        }
    }

    pageCleanups.set('search', () => {
        searchInput.removeEventListener('input', handleSearchInput);
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

function executePageScripts(path) {
    console.log('Executing scripts for:', path);
    let cleanup;
    switch (path) {
        case "story":
            storyActions();
            scrollAction();
            cleanup = () => {
                // Add cleanup logic if storyActions/scrollAction attach listeners
                console.log('Cleaned up story page');
            };
            break;
        case "play":
            flip();
            setupFriendsModal();
            cleanup = pageCleanups.get('play');
            break;
        case "home":
            home();
            cleanup = () => {
                // Add cleanup logic if home.js attaches listeners
                console.log('Cleaned up home page');
            };
            break;
        case "settings":
            settings();
            cleanup = () => {
                // Add cleanup logic if settings.js attaches listeners
                console.log('Cleaned up settings page');
            };
            break;
        case "game":
            game();
            cleanup = () => {
                // Add cleanup logic if game.js attaches listeners
                console.log('Cleaned up game page');
            };
            break;
    }
    if (cleanup) pageCleanups.set(path, cleanup);
}

export { handleAuthStateChange, fetchFriendsList, fetchLogin, sentInvites, receivedInvites, tournamentId, invitedFriends, participantCount };