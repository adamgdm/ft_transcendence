function create_game(opponent_username) {
    let body = opponent_username ? `player=${encodeURIComponent(opponent_username)}` : ``;
    return fetch('https://localhost:8000/create_game/', {
        method: 'POST',
        credentials: "include",
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body
    });
}

async function fetchFriendsList() {
    try {
        const response = await fetch('https://localhost:8000/get_friends/', { 
            method: 'GET', 
            headers: { 'Content-Type': 'application/json' }, 
            credentials: 'include' 
        });
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return (await response.json()).friends || [];
    } catch (error) {
        console.error('Error fetching friends list:', error);
        return [];
    }
}

async function fetchSentGameInvites() {
    try {
        const response = await fetch('https://localhost:8000/get_game_invites_sent/', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return (await response.json()).sent_invites || [];
    } catch (error) {
        console.error('Error fetching sent game invites:', error);
        return [];
    }
}

async function fetchReceivedGameInvites() {
    try {
        const response = await fetch('https://localhost:8000/get_game_invites_received/', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return (await response.json()).invites || [];
    } catch (error) {
        console.error('Error fetching received game invites:', error);
        return [];
    }
}

async function sendGameInvite(friend) {
    try {
        const response = await fetch('https://localhost:8000/send_game_invite/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ to_username: friend.username, game_mode: "online" })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorData.error || 'Unknown error'}`);
        }

        const data = await response.json();
        console.log("Send invite response:", data);
        return data;
    } catch (error) {
        console.error('Error sending game invite:', error);
        throw error;
    }
}

async function acceptGameInvite(inviteId) {
    try {
        const response = await fetch('https://localhost:8000/accept_game_invite/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ invite_id: inviteId })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorData.error || 'Unknown error'}`);
        }

        const data = await response.json();
        console.log("Accept game response:", data);
        if (data.game_id) {
            const state = { game_id: data.game_id, user: data.user };
            console.log("Pushing state for accept:", state);
            history.replaceState({}, "", "#play");
            history.pushState(state, "", "#game");
            console.log("State after push:", history.state);
            window.routeToPage('game');
        } else {
            console.error("No game_id in response:", data);
        }
        return data;
    } catch (error) {
        console.error('Error accepting game invite:', error);
        throw error;
    }
}

async function rejectGameInvite(inviteId) {
    try {
        const response = await fetch('https://localhost:8000/reject_game_invite/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ invite_id: inviteId })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorData.error || 'Unknown error'}`);
        }

        const data = await response.json();
        console.log(data.message || data.error);
        return data;
    } catch (error) {
        console.error('Error rejecting game invite:', error);
        throw error;
    }
}

export function flip() {
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

    const friendSearch = document.querySelector('#friendSearch');
    const friendsList = document.querySelector('#friendsList');
    const playOnlineButton = document.querySelector('.play-online-button');
    if (friendSearch && friendsList && !friendSearch.dataset.listenerAdded) {
        let allFriends = [];
        let sentInvites = [];
        let receivedInvites = [];

        friendSearch.addEventListener('focus', async function (e) {
            e.stopPropagation();
            if (allFriends.length === 0) {
                try {
                    [allFriends, sentInvites, receivedInvites] = await Promise.all([
                        fetchFriendsList(),
                        fetchSentGameInvites(),
                        fetchReceivedGameInvites()
                    ]);
                } catch (error) {
                    console.error('Error fetching data:', error);
                    friendsList.innerHTML = '<li>Error loading friends</li>';
                    return;
                }
            }
            renderFriends(allFriends, this.value.trim().toLowerCase(), sentInvites, receivedInvites);
            friendsList.style.display = 'block';
        });

        friendSearch.addEventListener('blur', function (e) {
            e.stopPropagation();
            setTimeout(() => {
                if (!friendsList.contains(document.activeElement)) {
                    friendsList.style.display = 'none';
                }
            }, 100);
        });

        friendSearch.addEventListener('input', function (e) {
            e.stopPropagation();
            const query = this.value.trim().toLowerCase();
            renderFriends(allFriends, query, sentInvites, receivedInvites);
        });

        friendSearch.addEventListener('click', function (e) {
            e.stopPropagation();
        });

        friendSearch.dataset.listenerAdded = 'true';

        if (playOnlineButton && !playOnlineButton.dataset.listenerAdded) {
            playOnlineButton.addEventListener('click', async function (e) {
                e.stopPropagation();
                const acceptedSentInvite = sentInvites.find(invite => invite.status === 'accepted' && invite.game_id);
                const acceptedReceivedInvite = receivedInvites.find(invite => invite.status === 'accepted' && invite.game_id);
                const gameInvite = acceptedSentInvite || acceptedReceivedInvite;
                if (gameInvite) {
                    const state = { game_id: gameInvite.game_id, user: gameInvite.to_username || gameInvite.from_username };
                    console.log("Pushing state for play online:", state);
                    history.replaceState({}, "", "#play");
                    history.pushState(state, "", "#game");
                    window.routeToPage('game');
                } else {
                    console.log("No accepted game invite found.");
                    alert("No active game found. Send or accept an invite to play!");
                }
            });
            playOnlineButton.dataset.listenerAdded = 'true';
        }

        function renderFriends(friends, query, sentInvites, receivedInvites) {
            friendsList.innerHTML = '';
            const filteredFriends = friends.filter(friend => 
                friend.username.toLowerCase().startsWith(query)
            );
            if (filteredFriends.length === 0) {
                friendsList.innerHTML = '<li>No friends found</li>';
                return;
            }

            const pendingSentUsernames = new Set(sentInvites.filter(invite => invite.status === 'pending').map(invite => invite.to_username));
            const acceptedSentUsernames = new Map(
                sentInvites
                    .filter(invite => invite.status === 'accepted' && invite.game_id)
                    .map(invite => [invite.to_username, { game_id: invite.game_id }])
            );
            const inviteStatusMap = new Map(
                receivedInvites.map(invite => [invite.from_username, { invite_id: invite.invite_id, game_id: invite.game_id, status: invite.status }])
            );

            filteredFriends.forEach(friend => {
                const li = document.createElement('li');
                li.textContent = friend.username;

                const hasSentInvite = pendingSentUsernames.has(friend.username);
                const receivedInvite = inviteStatusMap.get(friend.username);
                const acceptedSentInvite = acceptedSentUsernames.get(friend.username);

                if (acceptedSentInvite) {
                    // Host’s sent invite was accepted
                    const joinBtn = document.createElement('button');
                    joinBtn.textContent = 'Join Game';
                    joinBtn.classList.add('join-btn');
                    joinBtn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        const state = { game_id: acceptedSentInvite.game_id, user: friend.username };
                        console.log("Pushing state for host join:", state);
                        history.replaceState({}, "", "#play");
                        history.pushState(state, "", "#game");
                        window.routeToPage('game');
                    });
                    li.appendChild(joinBtn);
                } else if (receivedInvite) {
                    if (receivedInvite.status === 'accepted' && receivedInvite.game_id) {
                        const joinBtn = document.createElement('button');
                        joinBtn.textContent = 'Join Game';
                        joinBtn.classList.add('join-btn');
                        joinBtn.addEventListener('click', function (e) {
                            e.stopPropagation();
                            const state = { game_id: receivedInvite.game_id, user: friend.username };
                            console.log("Pushing state for guest join:", state);
                            history.replaceState({}, "", "#play");
                            history.pushState(state, "", "#game");
                            window.routeToPage('game');
                        });
                        li.appendChild(joinBtn);
                    } else if (receivedInvite.status === 'pending') {
                        const acceptBtn = document.createElement('button');
                        acceptBtn.textContent = 'Accept';
                        acceptBtn.classList.add('accept-btn');
                        acceptBtn.addEventListener('click', async function (e) {
                            e.stopPropagation();
                            const result = await acceptGameInvite(receivedInvite.invite_id);
                            if (result && result.game_id) {
                                receivedInvites = receivedInvites.map(invite =>
                                    invite.invite_id === receivedInvite.invite_id
                                        ? { ...invite, game_id: result.game_id, status: 'accepted' }
                                        : invite
                                );
                                // Refresh sent invites for the host in case they’re viewing
                                sentInvites = await fetchSentGameInvites();
                                renderFriends(allFriends, query, sentInvites, receivedInvites);
                            }
                        });

                        const refuseBtn = document.createElement('button');
                        refuseBtn.textContent = 'Refuse';
                        refuseBtn.classList.add('refuse-btn');
                        refuseBtn.addEventListener('click', async function (e) {
                            e.stopPropagation();
                            const result = await rejectGameInvite(receivedInvite.invite_id);
                            if (result && result.message) {
                                receivedInvites = receivedInvites.filter(invite => invite.invite_id !== receivedInvite.invite_id);
                                renderFriends(allFriends, query, sentInvites, receivedInvites);
                            }
                        });

                        li.appendChild(acceptBtn);
                        li.appendChild(refuseBtn);
                    }
                } else {
                    const inviteBtn = document.createElement('button');
                    inviteBtn.textContent = hasSentInvite ? 'Already Sent' : 'Invite';
                    inviteBtn.classList.add('invite-btn');
                    if (!hasSentInvite) {
                        inviteBtn.addEventListener('click', async function (e) {
                            e.stopPropagation();
                            const result = await sendGameInvite(friend);
                            if (result && result.invite_id) {
                                sentInvites.push({ to_username: friend.username, status: 'pending', invite_id: result.invite_id });
                                renderFriends(allFriends, query, sentInvites, receivedInvites);
                            }
                        });
                    } else {
                        inviteBtn.disabled = true;
                    }
                    li.appendChild(inviteBtn);
                }

                friendsList.appendChild(li);
            });
        }

        friendsList.style.display = 'none';
    }

    const playLocallyInner = document.querySelector('.playLocally-inner');
    if (playLocallyInner && !playLocallyInner.dataset.listenerAdded) {
        playLocallyInner.addEventListener('click', function (e) {
            if (!['INPUT', 'BUTTON', 'A', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) {
                this.classList.toggle('is-flipped');
            }
        });
        playLocallyInner.dataset.listenerAdded = 'true';
    }

    const playTournInner = document.querySelector('.playTourn-inner');
    if (playTournInner && !playTournInner.dataset.listenerAdded) {
        playTournInner.addEventListener('click', function (e) {
            if (!['INPUT', 'BUTTON', 'A', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) {
                this.classList.toggle('is-flipped');
            }
        });
        playTournInner.dataset.listenerAdded = 'true';
    }

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

    const tournCode = document.querySelector('.tourn-code');
    if (tournCode && !tournCode.dataset.listenerAdded) {
        tournCode.addEventListener('click', function (e) {
            e.stopPropagation();
        });
        tournCode.dataset.listenerAdded = 'true';
    }

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

    // Poll for invite status updates (temporary solution)
    setInterval(async () => {
        try {
            sentInvites = await fetchSentGameInvites();
            renderFriends(allFriends, friendSearch.value.trim().toLowerCase(), sentInvites, receivedInvites);
        } catch (error) {
            console.error("Error polling sent invites:", error);
        }
    }, 5000); // Poll every 5 seconds
}