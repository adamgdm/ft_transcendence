import { home } from "./pages/home/home.js";
import { flip } from "./pages/play/play.js"
import { settings } from "./pages/settings/settings.js";
import { storyActions } from "./pages/story/index.js"
import { scrollAction } from "./pages/story/scroll.js"


let isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';

const authenticatedPages = ['home', 'settings', 'shop', 'play']

window.onload = function () {
    const fragId = window.location.hash.substring(1) || 'story'
    routeToPage(fragId)
    
    window.addEventListener('hashchange', () => {
        const path = window.location.hash.substring(1) || 'story'
        routeToPage(path)
    })
}

function routeToPage(path) {
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
    const validRoutes = ['story', 'home','play', 'shop', 'settings', '404']
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
                suggestionDiv.textContent = user;
                
                // Create the invite button
                const inviteButton = document.createElement('button');
                inviteButton.classList.add('invite-btn');
                inviteButton.innerHTML = '<i class="fa-solid fa-user-plus"></i> Invite'; // Invite icon

                // Add click event to the invite button
                inviteButton.addEventListener('click', function() {
                    console.log(`Invite sent to ${user}`); // Replace with your invite logic
                });

                // Append the invite button to the suggestion
                suggestionDiv.appendChild(inviteButton);
                
                // Add click event to fill the search input with the selected username
                suggestionDiv.addEventListener('click', function() {
                    searchInput.value = user;
                    userSuggestionsBox.style.display = 'none'; // Hide the suggestions
                });

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
    const notifBar = document.querySelector('[layout="notifbar"]')

    if (item.classList.contains('notif')) {
        notifBar.classList.toggle('active')

        // Only add clicked if the notification bar becomes active
        if (!notifBar.classList.contains('active')) {
            item.classList.remove('clicked')
        }
    } else {
        hideNotifBar(notifBar)
        item.classList.remove('clicked')
    }
}

function hideNotifBar(bar) {
    bar.classList.remove('active')
}


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
        // Add other page-specific script initializations here
        default:
            break
    }
}
