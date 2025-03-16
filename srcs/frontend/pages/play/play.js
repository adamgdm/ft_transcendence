function create_game(opponent_username) {
    let body;
    if (opponent_username === '') {
        body = ``;
    } else { // Handle undefined game_opponent
        body = `player=${encodeURIComponent(opponent_username)}`;
    }

    return fetch('https://localhost:8000/create_game/', {
        method: 'POST',
        credentials: "include",
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body
    });
}

async function fetchFriendsList() {
    try {
        const response = await fetch('https://localhost:8000/get_friends/', { method: 'GET', headers: { 'Content-Type': 'application/json' }, credentials: 'include' });
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return (await response.json()).friends || [];
    } catch (error) {
        console.error('Error fetching friends list:', error);
        return [];
    }
}

export function flip() {
    // Play 1v1 Card
    const play1v1Inner = document.querySelector('.play1v1-inner');
    if (play1v1Inner && !play1v1Inner.dataset.listenerAdded) {
        play1v1Inner.addEventListener('click', function (e) {
            const interactiveElements = ['INPUT', 'BUTTON', 'A', 'SELECT', 'TEXTAREA', 'LI', 'UL'];
            if (!interactiveElements.includes(e.target.tagName)) {
                this.classList.toggle('is-flipped');
            }
        });
        play1v1Inner.dataset.listenerAdded = 'true';
    } else if (!play1v1Inner) {
        console.warn('.play1v1-inner not found');
    }

    // Search Bar and Friends List Logic
    const friendSearch = document.querySelector('#friendSearch');
    const friendsList = document.querySelector('#friendsList');
    if (friendSearch && friendsList && !friendSearch.dataset.listenerAdded) {
        let allFriends = [];

        // Load friends and show list on focus
        friendSearch.addEventListener('focus', async function (e) {
            e.stopPropagation();
            if (allFriends.length === 0) {
                try {
                    allFriends = await fetchFriendsList(); // Assuming this exists
                } catch (error) {
                    console.error('Error fetching friends:', error);
                    friendsList.innerHTML = '<li>Error loading friends</li>';
                    return;
                }
            }
            renderFriends(allFriends, this.value.trim().toLowerCase());
            friendsList.style.display = 'block'; // Show the list
        });

        // Hide list on blur, but not if clicking invite keeps focus
        friendSearch.addEventListener('blur', function (e) {
            e.stopPropagation();
            // Delay hiding to check if focus moves to an invite button
            setTimeout(() => {
                if (!friendsList.contains(document.activeElement)) {
                    friendsList.style.display = 'none';
                }
            }, 100); // Small delay to allow focus shift
        });

        // Live search on input while focused
        friendSearch.addEventListener('input', function (e) {
            e.stopPropagation();
            const query = this.value.trim().toLowerCase();
            renderFriends(allFriends, query);
        });

        // Prevent click on search bar from flipping card
        friendSearch.addEventListener('click', function (e) {
            e.stopPropagation();
        });

        friendSearch.dataset.listenerAdded = 'true';

        // Function to render friends list
        function renderFriends(friends, query) {
            friendsList.innerHTML = '';
            const filteredFriends = friends.filter(friend => 
                friend.username.toLowerCase().startsWith(query)
            );
            if (filteredFriends.length === 0) {
                friendsList.innerHTML = '<li>No friends found</li>';
                return;
            }
            filteredFriends.forEach(friend => {
                const li = document.createElement('li');
                li.textContent = friend.username;
                
                const inviteBtn = document.createElement('button');
                inviteBtn.textContent = 'Invite';
                inviteBtn.classList.add('invite-btn');
                inviteBtn.addEventListener('click', function (e) {
                    e.stopPropagation(); // Prevent flip
                    
                });

                li.appendChild(inviteBtn);
                friendsList.appendChild(li);
            });
        }

        // Initially hide the friends list
        friendsList.style.display = 'none';
    }

    // Play Locally Card
    const playLocallyInner = document.querySelector('.playLocally-inner');
    if (playLocallyInner && !playLocallyInner.dataset.listenerAdded) {
        playLocallyInner.addEventListener('click', function (e) {
            if (!['INPUT', 'BUTTON', 'A', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) {
                this.classList.toggle('is-flipped');
            }
        });
        playLocallyInner.dataset.listenerAdded = 'true';
    }

    // Tournament Card
    const playTournInner = document.querySelector('.playTourn-inner');
    if (playTournInner && !playTournInner.dataset.listenerAdded) {
        playTournInner.addEventListener('click', function (e) {
            if (!['INPUT', 'BUTTON', 'A', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) {
                this.classList.toggle('is-flipped');
            }
        });
        playTournInner.dataset.listenerAdded = 'true';
    }

    // Create Tournament Button
    const createTourn = document.querySelector('.create-tourn');
    if (createTourn && !createTourn.dataset.listenerAdded) {
        createTourn.addEventListener('click', function (e) {
            e.stopPropagation();
            const buttons = document.querySelector('.buttons');
            const tournCreated = document.querySelector('.tourn-created');
            if (buttons && tournCreated) {
                buttons.style.display = 'none';
                tournCreated.style.display = 'flex';
                tournCreated.style.flexDirection = 'column';
                tournCreated.style.alignItems = 'center';
                tournCreated.style.justifyContent = 'center';
            }
        });
        createTourn.dataset.listenerAdded = 'true';
    }

    // Join Tournament Button
    const joinTourn = document.querySelector('.join-tourn');
    if (joinTourn && !joinTourn.dataset.listenerAdded) {
        joinTourn.addEventListener('click', function (e) {
            e.stopPropagation();
            const buttons = document.querySelector('.buttons');
            const tournJoined = document.querySelector('.tourn-joined');
            if (buttons && tournJoined) {
                buttons.style.display = 'none';
                tournJoined.style.display = 'flex';
                tournJoined.style.flexDirection = 'column';
                tournJoined.style.alignItems = 'center';
                tournJoined.style.justifyContent = 'center';
            }
        });
        joinTourn.dataset.listenerAdded = 'true';
    }

    // Cancel Buttons
    document.querySelectorAll('.cancel-btn').forEach(btn => {
        if (!btn.dataset.listenerAdded) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                const buttons = document.querySelector('.buttons');
                if (buttons) {
                    btn.parentElement.style.display = 'none';
                    buttons.style.display = 'flex';
                    buttons.style.flexDirection = 'column';
                    buttons.style.justifyContent = 'space-between';
                }
            });
            btn.dataset.listenerAdded = 'true';
        }
    });

    // Tournament Code
    const tournCode = document.querySelector('.tourn-code');
    if (tournCode && !tournCode.dataset.listenerAdded) {
        tournCode.addEventListener('click', function (e) {
            e.stopPropagation();
        });
        tournCode.dataset.listenerAdded = 'true';
    }

    // Copy Button
    const copyBtn = document.querySelector('.copy-btn');
    if (copyBtn && !copyBtn.dataset.listenerAdded) {
        copyBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            const codeElement = this.previousElementSibling;
            if (codeElement) {
                const codeText = codeElement.textContent.trim();
                navigator.clipboard.writeText(codeText);
            }
        });
        copyBtn.dataset.listenerAdded = 'true';
    }

    // Play Locally Button
    const playLocallyButton = document.querySelector('.playLocally-button');
    if (playLocallyButton && !playLocallyButton.dataset.listenerAdded) {
        playLocallyButton.addEventListener('click', function (e) {
            e.stopPropagation();
            create_game('')
                .then(response => response.json().then(data => ({ ok: response.ok, data })))
                .then(({ ok, data }) => {
                    if (ok && data.game_id) {
                        history.pushState({ game_id: data.game_id, user: data.user }, "", "#game");
                        window.routeToPage('game');
                    } else {
                        console.error("Game creation failed:", data);
                    }
                })
                .catch(error => console.error("Error:", error));
        });
        playLocallyButton.dataset.listenerAdded = 'true';
    }
}