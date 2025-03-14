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
    
    // Append the suggestions box below the search input
    const navbarSearch = document.querySelector('.navbar-search');
    navbarSearch.appendChild(userSuggestionsBox);
    
    // Example user list (this should come from your database or API)
    const users = ['Alice', 'Aob', 'Aharlie', 'Aavid', 'Ava', 'Frank', 'Grace', 'Henry'];
    
    // Load pending requests from localStorage
    let pendingRequests = new Set();
    try {
        const savedRequests = localStorage.getItem('pendingFriendRequests');
        if (savedRequests) {
            pendingRequests = new Set(JSON.parse(savedRequests));
        }
    } catch (error) {
        console.error('Error loading pending requests from localStorage:', error);
    }
    
    // Function to save pending requests to localStorage
    function savePendingRequests() {
        try {
            localStorage.setItem('pendingFriendRequests', JSON.stringify([...pendingRequests]));
        } catch (error) {
            console.error('Error saving pending requests to localStorage:', error);
        }
    }
    
    // Listen for input changes
    searchInput.addEventListener('input', function() {
        const query = searchInput.value.toLowerCase();
        userSuggestionsBox.innerHTML = ''; // Clear previous suggestions
        
        if (query.length > 0) {
            // Filter users based on the query
            const filteredUsers = users.filter(user => user.toLowerCase().startsWith(query)).slice(0, 3);
            
            // Display up to 3 matching users
            filteredUsers.forEach(user => {
                const suggestionDiv = document.createElement('div');
                
                // Create text container for username
                const usernameText = document.createElement('span');
                usernameText.textContent = user;
                suggestionDiv.appendChild(usernameText);
                
                // Create the add button
                const addButton = document.createElement('button');
                const cancelButton = document.createElement('button');
                
                // Check if we've already sent a request to this user
                if (pendingRequests.has(user)) {
                    // Show Pending and Cancel buttons
                    addButton.classList.add('pending-btn');
                    addButton.textContent = 'Pending...';
                    addButton.disabled = true;
                    
                    cancelButton.classList.add('cancel-btn');
                    cancelButton.textContent = 'Cancel';
                    
                    // Add click event to the cancel button
                    cancelButton.addEventListener('click', function(event) {
                        event.stopPropagation(); // Prevent the suggestion click event from firing
                        
                        // Remove user from pending requests set and save to localStorage
                        pendingRequests.delete(user);
                        savePendingRequests();
                        
                        // Revert to the Add button state
                        addButton.classList.remove('pending-btn');
                        addButton.classList.add('add-btn');
                        addButton.textContent = 'Add';
                        addButton.disabled = false;
                        
                        // Remove the Cancel button
                        cancelButton.remove();
                        
                        console.log(`Invitation to ${user} canceled`); // Placeholder for backend logic
                    });
                } else {
                    // Show Add button only
                    addButton.classList.add('add-btn');
                    addButton.textContent = 'Add';
                    
                    // Add click event to the add button
                    addButton.addEventListener('click', function(event) {
                        event.stopPropagation(); // Prevent the suggestion click event from firing
                        
                        // Change button to "Pending..." state
                        addButton.classList.remove('add-btn');
                        addButton.classList.add('pending-btn');
                        addButton.textContent = 'Pending...';
                        addButton.disabled = true;
                        
                        // Add user to pending requests set and save to localStorage
                        pendingRequests.add(user);
                        savePendingRequests();
                        
                        // Create and append the Cancel button
                        cancelButton.classList.add('cancel-btn');
                        cancelButton.textContent = 'Cancel';
                        suggestionDiv.appendChild(cancelButton);
                        
                        // Add click event to the cancel button
                        cancelButton.addEventListener('click', function(event) {
                            event.stopPropagation(); // Prevent the suggestion click event from firing
                            
                            // Remove user from pending requests set and save to localStorage
                            pendingRequests.delete(user);
                            savePendingRequests();
                            
                            // Revert to the Add button state
                            addButton.classList.remove('pending-btn');
                            addButton.classList.add('add-btn');
                            addButton.textContent = 'Add';
                            addButton.disabled = false;
                            
                            // Remove the Cancel button
                            cancelButton.remove();
                            
                            console.log(`Invitation to ${user} canceled`); // Placeholder for backend logic
                        });
                        
                        console.log(`Invitation sent to ${user}`); // Placeholder for backend logic
                    });
                }
                
                // Add click event to the username area only
                usernameText.addEventListener('click', function(event) {
                    // Fill the search bar with the selected user's name
                    searchInput.value = user;
                    // Hide the suggestions box after selection
                    userSuggestionsBox.style.display = 'none';
                });
                
                // Append the add button to the suggestion
                suggestionDiv.appendChild(addButton);
                if (pendingRequests.has(user)) {
                    suggestionDiv.appendChild(cancelButton); // Append Cancel button if pending
                }
                userSuggestionsBox.appendChild(suggestionDiv);
            });
        }
        
        // Show/hide the suggestions box based on input
        if (userSuggestionsBox.children.length > 0) {
            userSuggestionsBox.style.display = 'block';
        } else {
            userSuggestionsBox.style.display = 'none';
        }
    });
    
    // Hide suggestions when clicking outside
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
