import { initializeWebSocket } from "./globalWebsocket.js";
import { game } from "./pages/game/game.js";
import { home } from "./pages/home/home.js";
import { flip } from "./pages/play/play.js"
import { settings } from "./pages/settings/settings.js";
import { storyActions } from "./pages/story/index.js"
import { scrollAction } from "./pages/story/scroll.js"


const authenticatedPages = ['home', 'settings', 'shop', 'play', 'game'];

// Initialize isAuthenticated from localStorage or default to false
window.isAuthenticated = localStorage.getItem('isAuthenticated') === 'true' || false;
console.log('Initial auth status:', window.isAuthenticated);

// Function to handle routing based on authentication status
window.routeToPage = function (path) {
    // Check if the route is valid
    if (!isValidRoute(path)) {
        loadPage('404'); // Load a 404 page for invalid routes
        return;
    }

    // Redirect to story if the user is not authenticated and tries to access authenticated pages
    if (authenticatedPages.includes(path) && !window.isAuthenticated) {
        console.log('Unauthorized access. Redirecting to story.');
        window.location.hash = 'story';
        return;
    }

    // Redirect away from story if the user is authenticated
    if (path === 'story' && window.isAuthenticated) {
        console.log('Authenticated user trying to access story. Redirecting to home.');
        window.location.hash = 'home';
        return;
    }

    // Load the appropriate layout based on authentication
    if (authenticatedPages.includes(path)) {
        loadAuthenticatedLayout(path); // Load authenticated pages
    } else {
        loadPage(path); // Load non-authenticated pages (e.g., story)
    }
};

// Handle page load and hash changes
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
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            console.log('Login successful:', data);
        
            localStorage.setItem('isAuthenticated', 'true');
            window.isAuthenticated = true;
            // generate_jwt_token fix
            window.location.hash = 'home';
            const currentUrl = new URL(window.location);
            currentUrl.searchParams.delete('code'); // Delete the 'code' parameter
            window.history.replaceState({}, '', currentUrl.toString());
            return ;
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Login failed: ' + error.message);
        });
    }


    // Reset isAuthenticated to false if loading the story page
    if (fragId === 'story') {
        localStorage.setItem('isAuthenticated', 'false');
        window.isAuthenticated = false;
    }

    console.log('Initial page:', fragId);
    routeToPage(fragId);

    // Listen for hash changes (e.g., user navigating to a new page)
    window.addEventListener('hashchange', () => {
        console.log('Hash changed:', window.location.hash);
        window.isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
        console.log('Current auth status:', window.isAuthenticated);

        const path = window.location.hash.substring(1) || 'story';
        routeToPage(path);
    });
};


function isValidRoute(path) {
    const validRoutes = ['story', 'home','play', 'shop', 'settings', '404', 'game']
    return validRoutes.includes(path)
}

function loadAuthenticatedLayout(contentPath) {
    const content = document.getElementById('content');

    if (!document.querySelector('.layout-container')) {
        const layoutRequest = new XMLHttpRequest();
        layoutRequest.open('GET', 'layout/authenticated-layout.html');
        layoutRequest.onload = function () {
            if (layoutRequest.status === 200) {
                content.innerHTML = layoutRequest.responseText;
                loadContentIntoLayout(contentPath);

                setupSidebarNavigation();
                setupSearchBar();
            }
            else {
                loadPage('404');
            }
        };
        layoutRequest.onerror = function() {
            loadPage('404');
        };
        layoutRequest.send();
    }
    else {
        loadContentIntoLayout(contentPath);
    }
}

function loadContentIntoLayout(path) {
    const contentContainer = document.querySelector('.content-wrapper');
    const loader = document.querySelector('.loading-div');

    if (!contentContainer || !loader) return;

    // Show the loader
    loader.classList.remove('fade-out');
    contentContainer.style.opacity = "0";

    const request = new XMLHttpRequest();
    request.open('GET', `pages/${path}/${path}.html`);
    request.onload = function () {
        if (request.status === 200) {
            contentContainer.innerHTML = request.responseText;
            updateStylesheet(`pages/${path}/${path}.css`);
            executePageScripts(path);

            setTimeout(() => {
                loader.classList.add('fade-out');
                contentContainer.style.opacity = "1";
            }, 1000);
        } else {
            contentContainer.innerHTML = '<p>Error loading content</p>';
            loader.classList.add('fade-out');
        }
    };

    request.onerror = function () {
        contentContainer.innerHTML = '<p>Error loading content</p>';
        loader.classList.add('fade-out');
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
                    // Set isAuthenticated to false
                    localStorage.setItem('isAuthenticated', 'false');
                    window.isAuthenticated = false;
                    console.log('User logged out. isAuthenticated set to false.');
                }

                // Remove 'clicked' class from all buttons
                document.querySelectorAll('.sidebar-menu div, .sidebar-actions div')
                    .forEach(button => button.classList.remove('clicked'));

                // Add 'clicked' class to the clicked button
                item.classList.add('clicked');

                // Change the window location hash to the target
                window.location.hash = target;
            }
        });
    });
}

function setupSearchBar() {
    const searchInput = document.getElementById('search-bar');
    const userSuggestionsBox = document.createElement('div');
    userSuggestionsBox.classList.add('user-suggestions');
    
    const navbarSearch = document.querySelector('.navbar-search');
    navbarSearch.appendChild(userSuggestionsBox);
    
    let pendingSentRequests = new Set();  // Requests I sent
    let pendingReceivedRequests = new Set();  // Requests sent to me
    let friendsList = new Set();  // Current friends

    try {
        const savedSentRequests = localStorage.getItem('pendingFriendRequests');
        if (savedSentRequests) pendingSentRequests = new Set(JSON.parse(savedSentRequests));
        
        const savedFriends = localStorage.getItem('friendsList');
        if (savedFriends) friendsList = new Set(JSON.parse(savedFriends));
    } catch (error) {
        console.error('Error loading data from localStorage:', error);
    }
    
    // Save data to localStorage
    function savePendingRequests() {
        try {
            localStorage.setItem('pendingFriendRequests', JSON.stringify([...pendingSentRequests]));
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
    
    // Debounce function
    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // API Functions
    async function fetchUsers(query) {
        try {
            const url = `/api/search_users/?query=${encodeURIComponent(query)}`;
            const response = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' }, credentials: 'include' });
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return (await response.json()).users || [];
        } catch (error) {
            console.error('Error fetching users:', error);
            return [];
        }
    }

    async function fetchPendingReceivedRequests() {
        try {
            const response = await fetch('/api/get_friend_requests/', { method: 'GET', headers: { 'Content-Type': 'application/json' }, credentials: 'include' });
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return (await response.json()).requests || [];
        } catch (error) {
            console.error('Error fetching received requests:', error);
            return [];
        }
    }

    async function fetchPendingSentRequests() {
        try {
            const response = await fetch('/api/get_sent_friend_requests/', { method: 'GET', headers: { 'Content-Type': 'application/json' }, credentials: 'include' });
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return (await response.json()).sent_requests || [];
        } catch (error) {
            console.error('Error fetching sent requests:', error);
            return [];
        }
    }

    async function fetchFriendsList() {
        try {
            const response = await fetch('/api/get_friends/', { method: 'GET', headers: { 'Content-Type': 'application/json' }, credentials: 'include' });
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return (await response.json()).friends || [];
        } catch (error) {
            console.error('Error fetching friends list:', error);
            return [];
        }
    }

    async function addFriendRequest(username) {
        try {
            const response = await fetch('/api/add_friend/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ friend_username: username })
            });
            const data = await response.json();
            console.log(data.message || data.error);
            return data;
        } catch (error) {
            console.error('Error adding friend:', error);
            return { error: 'Network error' };
        }
    }

    async function cancelFriendRequest(username) {
        try {
            const response = await fetch('/api/cancel_invite/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ friend_username: username })
            });
            const data = await response.json();
            console.log(data.message || data.error);
            return data;
        } catch (error) {
            console.error('Error canceling friend request:', error);
            return { error: 'Network error' };
        }
    }

    async function acceptFriendRequest(username) {
        try {
            const response = await fetch('/api/accept_friend/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ friend_username: username })
            });
            const data = await response.json();
            console.log(data.message || data.error);
            return data;
        } catch (error) {
            console.error('Error accepting friend request:', error);
            return { error: 'Network error' };
        }
    }

    async function rejectFriendRequest(username) {
        try {
            const response = await fetch('/api/reject_friend/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ friend_username: username })
            });
            const data = await response.json();
            console.log(data.message || data.error);
            return data;
        } catch (error) {
            console.error('Error rejecting friend request:', error);
            return { error: 'Network error' };
        }
    }

    async function removeFriend(username) {
        try {
            const response = await fetch('/api/remove_friend/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ friend_username: username })
            });
            const data = await response.json();
            console.log(data.message || data.error);
            return data;
        } catch (error) {
            console.error('Error removing friend:', error);
            return { error: 'Network error' };
        }
    }

    const handleSearchInput = debounce(async function () {
        const query = searchInput.value.trim().toLowerCase();
        userSuggestionsBox.innerHTML = ''; // Clear previous suggestions
        
        if (query.length > 0) {
            const [users, receivedRequests, sentRequests, friends] = await Promise.all([
                fetchUsers(query),
                fetchPendingReceivedRequests(),
                fetchPendingSentRequests(),
                fetchFriendsList()
            ]);

            // Update state with server data
            pendingReceivedRequests = new Set(receivedRequests.map(req => req.from_username));
            pendingSentRequests = new Set(sentRequests.map(req => req.to_username));
            friendsList = new Set(friends.map(f => f.username));

            // Sync localStorage
            savePendingRequests();
            saveFriendsList();

            users.slice(0, 3).forEach(user => {
                const suggestionDiv = document.createElement('div');
                suggestionDiv.classList.add('suggestion-item');
                
                const usernameText = document.createElement('span');
                usernameText.textContent = user.username;
                usernameText.addEventListener('click', () => {
                    searchInput.value = user.username;
                    userSuggestionsBox.style.display = 'none';
                });
                
                suggestionDiv.appendChild(usernameText);

                // Determine relationship status and configure buttons
                if (friendsList.has(user.username)) {
                    const removeButton = document.createElement('button');
                    removeButton.classList.add('remove-btn');
                    removeButton.textContent = 'Remove';
                    removeButton.onclick = async (e) => {
                        e.stopPropagation();
                        const result = await removeFriend(user.username);
                        if (!result.error) {
                            friendsList.delete(user.username);
                            saveFriendsList();
                            handleSearchInput();
                        }
                    };
                    suggestionDiv.appendChild(removeButton);
                } else if (pendingReceivedRequests.has(user.username)) {
                    const acceptButton = document.createElement('button');
                    acceptButton.classList.add('accept-btn');
                    acceptButton.textContent = 'Accept';
                    acceptButton.onclick = async (e) => {
                        e.stopPropagation();
                        const result = await acceptFriendRequest(user.username);
                        if (!result.error) {
                            pendingReceivedRequests.delete(user.username);
                            friendsList.add(user.username);
                            saveFriendsList();
                            handleSearchInput();
                        }
                    };

                    const ignoreButton = document.createElement('button');
                    ignoreButton.classList.add('ignore-btn');
                    ignoreButton.textContent = 'Ignore';
                    ignoreButton.onclick = async (e) => {
                        e.stopPropagation();
                        const result = await rejectFriendRequest(user.username);
                        if (!result.error) {
                            pendingReceivedRequests.delete(user.username);
                            handleSearchInput();
                        }
                    };

                    suggestionDiv.appendChild(acceptButton);
                    suggestionDiv.appendChild(ignoreButton);
                } else if (pendingSentRequests.has(user.username)) {
                    const cancelButton = document.createElement('button');
                    cancelButton.classList.add('cancel-btn');
                    cancelButton.textContent = 'Cancel';
                    cancelButton.onclick = async (e) => {
                        e.stopPropagation();
                        const result = await cancelFriendRequest(user.username);
                        if (!result.error) {
                            pendingSentRequests.delete(user.username);
                            savePendingRequests();
                            handleSearchInput();
                        }
                    };
                    suggestionDiv.appendChild(cancelButton);
                } else {
                    const addButton = document.createElement('button');
                    addButton.classList.add('add-btn');
                    addButton.textContent = 'Add';
                    addButton.onclick = async (e) => {
                        e.stopPropagation();
                        const result = await addFriendRequest(user.username);
                        if (!result.error) {
                            pendingSentRequests.add(user.username);
                            savePendingRequests();
                            handleSearchInput();
                        }
                    };
                    suggestionDiv.appendChild(addButton);
                }

                userSuggestionsBox.appendChild(suggestionDiv);
            });
        }

        userSuggestionsBox.style.display = userSuggestionsBox.children.length > 0 ? 'block' : 'none';
    }, 300);

    // Event listeners
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

        // Only remove clicked if the notification bar becomes inactive
        if (!notifBar.classList.contains('active')) {
            item.classList.remove('clicked');
        }
    } else {
        hideNotifBar(notifBar);
        item.classList.remove('clicked');
    }
}

function hideNotifBar(bar) {
    bar.classList.remove('active');
}

// Add event listeners for Accept and Decline buttons
document.querySelectorAll('.notif-item').forEach(item => {
    const acceptBtn = item.querySelector('.accept-btn');
    const declineBtn = item.querySelector('.decline-btn');

    acceptBtn.addEventListener('click', () => {
        const userName = item.querySelector('.notif-text').textContent.split(' ')[0];
        alert(`You accepted ${userName}'s friend request!`);
        item.remove(); // Remove the notification item after accepting
    });

    declineBtn.addEventListener('click', () => {
        const userName = item.querySelector('.notif-text').textContent.split(' ')[0];
        alert(`You declined ${userName}'s friend request!`);
        item.remove(); // Remove the notification item after declining
    });
});


function loadPage(path) {
    const content = document.getElementById('content')
    
    try {
        const request = new XMLHttpRequest()
        request.open('GET', `pages/${path}/${path}.html`)
        request.onload = function() {
            if (request.status === 200) {
                content.innerHTML = request.responseText
                updateStylesheet(`pages/${path}/${path}.css`)
                executePageScripts(path)
            } else {
                loadPage('404')
            }
        }
        request.onerror = function() {
            loadPage('404')
        }
        request.send()
    } catch (error) {
        console.log("Error loading page:", error)
        loadPage('404')
    }
}

function updateStylesheet(href) {
    let linkTag = document.querySelector("link[data-section-style]")
    if (!linkTag) {
        linkTag = document.createElement("link")
        linkTag.rel = "stylesheet"
        linkTag.dataset.sectionStyle = "true"
        document.head.appendChild(linkTag)
    }
    linkTag.href = href
}

function executePageScripts(path) {
    switch (path) {
        case "story":
            storyActions()
            scrollAction()
            break
        case "play":
            flip()
            break
        case "home":
            home()
            break
        case "settings":
            settings()
            break
        case "game":
            game()
            break
        default:
            break
    }
}
