import { storyActions } from "./pages/story/index.js"
import { scrollAction } from "./pages/story/scroll.js"

window.onload = function () {
    // when typing the url first time
    const fragId = window.location.hash.substring(1)
    console.log("this frag is : " + fragId)

    switch (fragId) {
        case "story":
        case "":
            loadPage('story')
            break
        case '404':
            loadPage('404')
            break
        case 'home':
            loadPage('home')
        // default:
        //     loadPage('404')
    }

    // when clicking on items in sidebar
    // document.querySelectorAll('.menu-item').forEach(item => {
    //     item.addEventListener('click', () => {
    //         const path = item.getAttribute('value')
    //         loadPage(path)
    //         if (path == "") {
    //             window.location.hash = ""
    //             return
    //         }
    //         else    {
    //             window.location.hash = path
    //         }
    //     })

    // })

    // track changes on the url
    window.addEventListener('hashchange', () => {
        const path = window.location.hash.substring(1)
        loadPage(path)
    })


    function updateStylesheet(href) {
        let linkTag = document.querySelector("link[data-section-style]");
        if (!linkTag){
            linkTag = document.createElement("link");
        linkTag.rel = "stylesheet";
        linkTag.dataset.dynamic = "true";
        document.head.appendChild(linkTag);
    }
    linkTag.href = href;
    }

    // the function that loads pages
    function loadPage(path) {
        const content = document.getElementById('content')

        try {
            const request = new XMLHttpRequest()
            request.open('GET', `pages/${path}/${path}.html`)
            request.send()
            request.onload = function () {
                if (request.status == 200) {
                    content.innerHTML = request.responseText
                    updateStylesheet(`pages/${path}/${path}.css`)
                    switch (path) {
                        case "story":
                        case "":
                            storyActions()
                            scrollAction()
                            scroll
                            break
                        default:
                            break
                    }
                }
                else {
                    loadPage('404')
                }
            }
        }
        catch {
            console.log("Error loading page:", error);
            request.onerror = function () {
                loadPage('404')
            }
        }
    }
}