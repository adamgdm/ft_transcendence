import { flip } from "./pages/play/play.js"
import { storyActions } from "./pages/story/index.js"
import { scrollAction } from "./pages/story/scroll.js"

let isAutheticated = true

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
        if (!isAutheticated) {
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
        // Add other page-specific script initializations here
        default:
            break
    }
}
