import { initializeWebSocket, sendFriendRequest, acceptFriendRequest, rejectFriendRequest, cancelFriendRequest, isConnected, closeConnection } from "./globalWebsocket.js";
import { game } from "./pages/game/game.js";
import { home } from "./pages/home/home.js";
import { flip } from "./pages/play/play.js";
import { settings } from "./pages/settings/settings.js";
import { storyActions } from "./pages/story/index.js";
import { scrollAction } from "./pages/story/scroll.js";

const authenticatedPages = ['home', 'settings', 'shop', 'play', 'game'];

window.isAuthenticated = localStorage.getItem('isAuthenticated') === 'true' || false;
console.log('Initial isAuthenticated:', window.isAuthenticated);

let pendingSentRequests = new Set();
let pendingReceivedRequests = new Set();
let friendsList = new Set();

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
    console.log('savePendingRequests');
    try {
        localStorage.setItem('pendingFriendRequests', JSON.stringify([...pendingSentRequests]));
        localStorage.setItem('pendingReceivedRequests', JSON.stringify([...pendingReceivedRequests]));
    } catch (error) {
        console.error('Error saving pending requests:', error);
    }
}

function saveFriendsList() {
    console.log('saveFriendsList');
    try {
        localStorage.setItem('friendsList', JSON.stringify([...friendsList]));
    } catch (error) {
        console.error('Error saving friends list:', error);
    }
}

async function fetchUsers(query) {
    console.log('fetchUsers:', query);
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
    console.log('fetchPendingReceivedRequests');
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
    console.log('fetchPendingSentRequests');
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
    console.log('fetchFriendsList');
    try {
        const response = await fetch('api/get_friends/', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data = await response.json();
        return data.friends || [];
    } catch (error) {
        console.error('Error fetching friends list:', error);
        return [];
    }
}

async function removeFriend(username) {
    console.log('removeFriend:', username);
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
        console.log('handleAuthStateChange: Initializing WebSocket');
        initializeWebSocket();
        syncStateWithWebSocket();
    } else {
        console.log('handleAuthStateChange: Closing WebSocket');
        closeConnection();
    }
}

window.routeToPage = function (path) {
    console.log('routeToPage:', path);
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

    console.log('routeToPage: Proceeding to load:', path);
    if (authenticatedPages.includes(path)) {
        loadAuthenticatedLayout(path);
    } else {
        loadPage(path);
    }
};

window.onload = function () {
    const fragId = window.location.hash.substring(1) || 'story';
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');  // Get the 'code' query parameter from the URL

    if (code) {
        console.log(code)
        // Now send the 'code' back to the backend for exchanging it for the user data
        fetch('/api/oauth2/login/redirect/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ code: code }), // Send the code as JSON
            credentials: 'include',
        })
        .then(response => {
            console.log('Response status:', response.status);
            if (response.status !== 200) {
                throw new Error('Network response was not ok' + response.text());
            }
            return response.json();
        })
        .then(data => {
            console.log('Login successful:', data);
        
            localStorage.setItem('isAuthenticated', 'true');
            initializeWebSocket();
            setTimeout(() => {
                if (isConnected()) {
                    window.location.hash = 'home';
                } else {
                    console.error('WebSocket not initialized, navigation aborted');
                    alert('Failed to initialize connection, please try again');
                }
            }, 1000);
            window.isAuthenticated = true;
            window.location.hash = 'home';
            const currentUrl = new URL(window.location);
            currentUrl.searchParams.delete('code');
            window.history.replaceState({}, '', currentUrl.toString());
            return ;
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Login failed: ' + error.message);
        });
    }


    if (fragId === 'story') {
        localStorage.setItem('isAuthenticated', 'false');
        window.isAuthenticated = false;
        console.log('onload: Reset isAuthenticated for story');
    }

    handleAuthStateChange();
    routeToPage(fragId);

    window.addEventListener('hashchange', () => {
        const path = window.location.hash.substring(1) || 'story';
        console.log('hashchange:', path);
        routeToPage(path);
    });
};

function syncStateWithWebSocket() {
    console.log('syncStateWithWebSocket: Setting up listener');
    window.addEventListener('websocketMessage', (event) => {
        const data = event.detail;
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
                // Optionally track sent invites if needed
                break;
            default:
        }
    });
}

function isValidRoute(path) {
    const validRoutes = ['story', 'home', 'play', 'shop', 'settings', '404', 'game'];
    return validRoutes.includes(path);
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
    document.querySelectorAll('.sidebar-menu div, .sidebar-actions div').forEach(item => {
        item.addEventListener('click', () => {
            handleNotifBtn(item);
            const target = item.getAttribute('data-target');
            if (target) {
                if (target === '#story') {
                    localStorage.setItem('isAuthenticated', 'false');
                    window.isAuthenticated = false;
                    handleAuthStateChange();
                }
                document.querySelectorAll('.sidebar-menu div, .sidebar-actions div').forEach(button => button.classList.remove('clicked'));
                item.classList.add('clicked');
                window.location.hash = target;
            }
        });
    });
}

function setupFriendsModal() {
    const waitForButton = setInterval(() => {
        const seeFriendsBtn = document.querySelector(".see-friends-btn");
        if (seeFriendsBtn) {
            clearInterval(waitForButton);
            seeFriendsBtn.addEventListener("click", async () => {
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

                closeBtn.addEventListener("click", () => {
                    friendsModal.style.opacity = "0";
                    friendsModal.style.visibility = "hidden";
                    searchBar.value = '';
                    renderFriends([...friendsList], friendsListContainer);
                });

                searchBar.addEventListener('input', () => {
                    const query = searchBar.value.trim().toLowerCase();
                    const filteredFriends = [...friendsList].filter(friend => friend.toLowerCase().startsWith(query));
                    renderFriends(filteredFriends, friendsListContainer);
                });
            });
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
            friendItem.querySelector('.remove-friend').addEventListener('click', async (e) => {
                e.stopPropagation();
                const result = await removeFriend(username);
                if (!result.error) {
                    friendsList.delete(username);
                    saveFriendsList();
                    renderFriends([...friendsList].filter(f => f.toLowerCase().startsWith(searchBar.value.trim().toLowerCase())), container);
                }
            });
            container.appendChild(friendItem);
        });
    }
}

document.addEventListener("DOMContentLoaded", setupFriendsModal);

function setupSearchBar() {
    const searchInput = document.getElementById('search-bar');
    const userSuggestionsBox = document.createElement('div');
    userSuggestionsBox.classList.add('user-suggestions');
    const navbarSearch = document.querySelector('.navbar-search');
    navbarSearch.appendChild(userSuggestionsBox);

    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    const handleSearchInput = debounce(async () => {
        const query = searchInput.value.trim().toLowerCase();
        userSuggestionsBox.innerHTML = '';

        if (query.length > 0) {
            const [users, receivedRequests, sentRequests, friends] = await Promise.all([
                fetchUsers(query),
                fetchPendingReceivedRequests(),
                fetchPendingSentRequests(),
                fetchFriendsList()
            ]);

            pendingReceivedRequests = new Set(receivedRequests.map(req => req.from_username));
            pendingSentRequests = new Set(sentRequests.map(req => req.to_username));
            friendsList = new Set(friends.map(f => f.username));
            savePendingRequests();
            saveFriendsList();

            users.slice(0, 3).forEach(user => {
                const suggestionDiv = document.createElement('div');
                suggestionDiv.classList.add('suggestion-item');
                suggestionDiv.innerHTML = `<span>${user.username}</span>`;
                suggestionDiv.querySelector('span').addEventListener('click', () => {
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
                    suggestionDiv.innerHTML += `
                        <button class="accept-btn">Accept</button>
                        <button class="ignore-btn">Ignore</button>
                    `;
                    suggestionDiv.querySelector('.accept-btn').onclick = async (e) => {
                        e.stopPropagation();
                        const result = await acceptFriendRequest(user.username);
                        if (!result.error) {
                            pendingReceivedRequests.delete(user.username);
                            friendsList.add(user.username);
                            savePendingRequests();
                            saveFriendsList();
                            handleSearchInput();
                        }
                    };
                    suggestionDiv.querySelector('.ignore-btn').onclick = async (e) => {
                        e.stopPropagation();
                        const result = await rejectFriendRequest(user.username);
                        if (!result.error) {
                            pendingReceivedRequests.delete(user.username);
                            savePendingRequests();
                            handleSearchInput();
                        }
                    };
                } else if (pendingSentRequests.has(user.username)) {
                    suggestionDiv.innerHTML += `<button class="cancel-btn">Cancel</button>`;
                    suggestionDiv.querySelector('.cancel-btn').onclick = async (e) => {
                        e.stopPropagation();
                        const result = await cancelFriendRequest(user.username);
                        if (!result.error) {
                            pendingSentRequests.delete(user.username);
                            savePendingRequests();
                            handleSearchInput();
                        }
                    };
                } else {
                    suggestionDiv.innerHTML += `<button class="add-btn">Add</button>`;
                    suggestionDiv.querySelector('.add-btn').onclick = async (e) => {
                        e.stopPropagation();
                        const result = await sendFriendRequest(user.username);
                        if (!result.error) {
                            pendingSentRequests.add(user.username);
                            savePendingRequests();
                            handleSearchInput();
                        }
                    };
                }

                userSuggestionsBox.appendChild(suggestionDiv);
            });
            userSuggestionsBox.style.display = 'block';
        } else {
            userSuggestionsBox.style.display = 'none';
        }
    }, 300);

    searchInput.addEventListener('input', handleSearchInput);
    document.addEventListener('click', (event) => {
        if (!navbarSearch.contains(event.target)) {
            userSuggestionsBox.style.display = 'none';
        }
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
    console.log('executePageScripts:', path);
    switch (path) {
        case "story":
            storyActions();
            scrollAction();
            break;
        case "play":
            flip();
            setupFriendsModal();
            break;
        case "home":
            home();
            break;
        case "settings":
            settings();
            break;
        case "game":
            game();
            break;
    }
}

export { handleAuthStateChange };