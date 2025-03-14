import { initializeWebSocket } from "./globalWebsocket.js";
import { game } from "./pages/game/game.js";
import { home } from "./pages/home/home.js";
import { flip } from "./pages/play/play.js"
import { settings } from "./pages/settings/settings.js";
import { storyActions } from "./pages/story/index.js"
import { scrollAction } from "./pages/story/scroll.js"


let isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';

const authenticatedPages = ['home', 'settings', 'shop', 'play', 'game']

window.onload = function () {
    const fragId = window.location.hash.substring(1) || 'story'
    routeToPage(fragId)
    
    window.addEventListener('hashchange', () => {
        const path = window.location.hash.substring(1) || 'story'
        routeToPage(path)
    })

    if (isAuthenticated) {
        initializeWebSocket()
    }
}

window.routeToPage = function (path) {
    if (!isValidRoute(path)) {
        loadPage('404')
        return
    }

    if (authenticatedPages.includes(path))  {
        if (!isAuthenticated) {
            window.location.hash = 'story'
            return
        }

        loadAuthenticatedLayout(path)
    }
    else {
        loadPage(path)
    }
}

function isValidRoute(path) {
    const validRoutes = ['story', 'home','play', 'shop', 'settings', '404', 'game']
    return validRoutes.includes(path)
}

function loadAuthenticatedLayout(contentPath) {
    const content = document.getElementById('content')

    if (!document.querySelector('.layout-container')) {
        const layoutRequest = new XMLHttpRequest()
        layoutRequest.open('GET', 'layout/authenticated-layout.html')
        layoutRequest.onload = function () {
            if (layoutRequest.status === 200) {
                content.innerHTML = layoutRequest.responseText
                console.log("authenticated layout rendered")
                loadContentIntoLayout(contentPath)

                setupSidebarNavigation()
                setupSearchBar();
            }
            else {
                loadPage('404')
            }
        }
        layoutRequest.onerror = function() {
            loadPage('404')
        }
        layoutRequest.send()
    }
    else {
        loadContentIntoLayout(contentPath)
    }
}

function loadContentIntoLayout(path) {
    const contentContainer = document.querySelector('.content-wrapper')
    const loader = document.querySelector('.loading-div')

    if (!contentContainer || !loader) return

    // Show the loader
    loader.classList.remove('fade-out')
    contentContainer.style.opacity = "0"

    const request = new XMLHttpRequest()
    request.open('GET', `pages/${path}/${path}.html`)
    request.onload = function () {
        if (request.status === 200) {
            contentContainer.innerHTML = request.responseText
            updateStylesheet(`pages/${path}/${path}.css`)
            executePageScripts(path)

            setTimeout(() => {
                loader.classList.add('fade-out')
                contentContainer.style.opacity = "1"
            }, 1000)
        } else {
            contentContainer.innerHTML = '<p>Error loading content</p>'
            loader.classList.add('fade-out')
        }
    }

    request.onerror = function () {
        contentContainer.innerHTML = '<p>Error loading content</p>'
        loader.classList.add('fade-out')
    }

    request.send()
}


function setupSidebarNavigation() {
    document.querySelectorAll('.sidebar-menu div, .sidebar-actions div').forEach(item => {
        item.addEventListener('click', () => {
            handleNotifBtn(item)
            const target = item.getAttribute('data-target')

            if (target) {
                document.querySelectorAll('.sidebar-menu div, .sidebar-actions div')
                    .forEach(button => button.classList.remove('clicked'))
                    
                item.classList.add('clicked')
                window.location.hash = target
            }
        })
    })
}

function setupSearchBar() {
    const searchInput = document.getElementById('search-bar');
    const userSuggestionsBox = document.createElement('div');
    userSuggestionsBox.classList.add('user-suggestions');
    
    const navbarSearch = document.querySelector('.navbar-search');
    navbarSearch.appendChild(userSuggestionsBox);
    
    let pendingSentRequests = new Set();  // Requests you sent
    let pendingReceivedRequests = new Set();  // Requests sent to you
    let friendsList = new Set();  // Current friends
    try {
        const savedSentRequests = localStorage.getItem('pendingFriendRequests');
        if (savedSentRequests) {
            pendingSentRequests = new Set(JSON.parse(savedSentRequests));
        }
        // Optionally load friends from localStorage for testing
        const savedFriends = localStorage.getItem('friendsList');
        if (savedFriends) {
            friendsList = new Set(JSON.parse(savedFriends));
        }
    } catch (error) {
        console.error('Error loading data from localStorage:', error);
    }
    
    function savePendingRequests() {
        try {
            localStorage.setItem('pendingFriendRequests', JSON.stringify([...pendingSentRequests]));
        } catch (error) {
            console.error('Error saving pending requests to localStorage:', error);
        }
    }

    function saveFriendsList() {
        try {
            localStorage.setItem('friendsList', JSON.stringify([...friendsList]));
        } catch (error) {
            console.error('Error saving friends list to localStorage:', error);
        }
    }
    
    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    async function fetchUsers(query) {
        try {
            const url = `https://localhost:8000/search_users/?query=${encodeURIComponent(query)}`;
            console.log('Fetching from:', url);
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });
            if (!response.ok) {
                console.error(`HTTP error! Status: ${response.status}`);
                return [];
            }
            const data = await response.json();
            return data.users || [];
        } catch (error) {
            console.error('Error fetching users:', error);
            return [];
        }
    }

    async function fetchPendingReceivedRequests() {
        try {
            const response = await fetch('https://localhost:8000/get_friend_requests/', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });
            if (!response.ok) {
                console.error(`HTTP error! Status: ${response.status}`);
                return [];
            }
            const data = await response.json();
            return data.requests || [];
        } catch (error) {
            console.error('Error fetching pending requests:', error);
            return [];
        }
    }

    async function fetchFriendsList() {
        try {
            const response = await fetch('https://localhost:8000/get_friends/', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });
            if (!response.ok) {
                console.error(`HTTP error! Status: ${response.status}`);
                return [];
            }
            const data = await response.json();
            return data.friends || [];  // Expecting [{username: "friend1"}, ...]
        } catch (error) {
            console.error('Error fetching friends list:', error);
            return [];
        }
    }

    async function addFriendRequest(username) {
        try {
            const body = JSON.stringify({ friend_username: username });
            const response = await fetch('https://localhost:8000/add_friend/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: body
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
            const response = await fetch('https://localhost:8000/cancel_invite/', {
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
            const body = JSON.stringify({ friend_username: username });
            const response = await fetch('https://localhost:8000/accept_friend/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: body
            });
            const data = await response.json();
            console.log(data.message || data.error);
            if (!data.error) {
                friendsList.add(username);  // Add to friends list on accept
                saveFriendsList();
            }
            return data;
        } catch (error) {
            console.error('Error accepting friend request:', error);
            return { error: 'Network error' };
        }
    }

    async function removeFriend(username) {
        try {
            const body = JSON.stringify({ friend_username: username });
            const response = await fetch('https://localhost:8000/remove_friend/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: body
            });
            const data = await response.json();
            console.log(data.message || data.error);
            if (!data.error) {
                friendsList.delete(username);
                saveFriendsList();
            }
            return data;
        } catch (error) {
            console.error('Error removing friend:', error);
            return { error: 'Network error' };
        }
    }

    const handleSearchInput = debounce(async function () {
        const query = searchInput.value.trim().toLowerCase();
        userSuggestionsBox.innerHTML = '';
        
        if (query.length > 0) {
            const filteredUsers = await fetchUsers(query);
            const receivedRequests = await fetchPendingReceivedRequests();
            const friends = await fetchFriendsList();
            pendingReceivedRequests = new Set(receivedRequests.map(req => req.from_username));
            friendsList = new Set(friends.map(f => f.username));  // Update friends list
            
            filteredUsers.slice(0, 3).forEach(user => {
                const suggestionDiv = document.createElement('div');
                const usernameText = document.createElement('span');
                usernameText.textContent = user.username;
                suggestionDiv.appendChild(usernameText);
                
                const actionButton = document.createElement('button');
                const cancelButton = document.createElement('button');
                
                if (friendsList.has(user.username)) {
                    // User is already a friend
                    actionButton.classList.add('remove-btn');
                    actionButton.textContent = 'Remove Friend';
                    actionButton.addEventListener('click', async function(event) {
                        event.stopPropagation();
                        const result = await removeFriend(user.username);
                        if (!result.error) {
                            actionButton.classList.remove('remove-btn');
                            actionButton.classList.add('add-btn');
                            actionButton.textContent = 'Add';
                            actionButton.removeEventListener('click', arguments.callee);  // Remove this listener
                            actionButton.addEventListener('click', async function(event) {
                                event.stopPropagation();
                                const addResult = await addFriendRequest(user.username);
                                if (!addResult.error) {
                                    actionButton.classList.remove('add-btn');
                                    actionButton.classList.add('pending-btn');
                                    actionButton.textContent = 'Pending...';
                                    actionButton.disabled = true;
                                    pendingSentRequests.add(user.username);
                                    savePendingRequests();
                                    cancelButton.classList.add('cancel-btn');
                                    cancelButton.textContent = 'Cancel';
                                    suggestionDiv.appendChild(cancelButton);
                                    // Add cancel logic here if needed
                                }
                            });
                        }
                    });
                } else if (pendingSentRequests.has(user.username)) {
                    // You sent a request to this user
                    actionButton.classList.add('pending-btn');
                    actionButton.textContent = 'Pending...';
                    actionButton.disabled = true;
                    cancelButton.classList.add('cancel-btn');
                    cancelButton.textContent = 'Cancel';
                    cancelButton.addEventListener('click', async function(event) {
                        event.stopPropagation();
                        const result = await cancelFriendRequest(user.username);
                        if (!result.error) {
                            pendingSentRequests.delete(user.username);
                            savePendingRequests();
                            actionButton.classList.remove('pending-btn');
                            actionButton.classList.add('add-btn');
                            actionButton.textContent = 'Add';
                            actionButton.disabled = false;
                            cancelButton.remove();
                        }
                    });
                } else if (pendingReceivedRequests.has(user.username)) {
                    // This user sent you a request
                    actionButton.classList.add('accept-btn');
                    actionButton.textContent = 'Accept';
                    actionButton.addEventListener('click', async function(event) {
                        event.stopPropagation();
                        const result = await acceptFriendRequest(user.username);
                        if (!result.error) {
                            pendingReceivedRequests.delete(user.username);
                            actionButton.classList.remove('accept-btn');
                            actionButton.classList.add('remove-btn');
                            actionButton.textContent = 'Remove Friend';
                            actionButton.removeEventListener('click', arguments.callee);
                            actionButton.addEventListener('click', async function(event) {
                                event.stopPropagation();
                                const removeResult = await removeFriend(user.username);
                                if (!removeResult.error) {
                                    actionButton.classList.remove('remove-btn');
                                    actionButton.classList.add('add-btn');
                                    actionButton.textContent = 'Add';
                                    // Reattach add logic if needed
                                }
                            });
                        }
                    });
                } else {
                    // No relationship yet
                    actionButton.classList.add('add-btn');
                    actionButton.textContent = 'Add';
                    actionButton.addEventListener('click', async function(event) {
                        event.stopPropagation();
                        const result = await addFriendRequest(user.username);
                        if (!result.error) {
                            actionButton.classList.remove('add-btn');
                            actionButton.classList.add('pending-btn');
                            actionButton.textContent = 'Pending...';
                            actionButton.disabled = true;
                            pendingSentRequests.add(user.username);
                            savePendingRequests();
                            cancelButton.classList.add('cancel-btn');
                            cancelButton.textContent = 'Cancel';
                            suggestionDiv.appendChild(cancelButton);
                            cancelButton.addEventListener('click', async function(event) {
                                event.stopPropagation();
                                const cancelResult = await cancelFriendRequest(user.username);
                                if (!cancelResult.error) {
                                    pendingSentRequests.delete(user.username);
                                    savePendingRequests();
                                    actionButton.classList.remove('pending-btn');
                                    actionButton.classList.add('add-btn');
                                    actionButton.textContent = 'Add';
                                    actionButton.disabled = false;
                                    cancelButton.remove();
                                }
                            });
                        }
                    });
                }
                
                usernameText.addEventListener('click', function(event) {
                    searchInput.value = user.username;
                    userSuggestionsBox.style.display = 'none';
                });
                
                suggestionDiv.appendChild(actionButton);
                if (pendingSentRequests.has(user.username)) {
                    suggestionDiv.appendChild(cancelButton);
                }
                userSuggestionsBox.appendChild(suggestionDiv);
            });
        }
        
        if (userSuggestionsBox.children.length > 0) {
            userSuggestionsBox.style.display = 'block';
        } else {
            userSuggestionsBox.style.display = 'none';
        }
    }, 300);

    searchInput.addEventListener('input', handleSearchInput);
    
    document.addEventListener('click', function(event) {
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
        case "game":
            game()
            break
        default:
            break
    }
}
