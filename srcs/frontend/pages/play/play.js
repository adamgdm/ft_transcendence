// frontend/play.js

import { friendshipSocket } from "../../globalWebsocket.js";

function create_game(opponent_username) {
    let body = opponent_username ? `player=${encodeURIComponent(opponent_username)}` : ``;
    return fetch('https://localhost:8000/create_game/', {
        method: 'POST',
        credentials: "include",
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body
    });
}

async function fetchLogin() {
    try {
        const response = await fetch('https://localhost:8000/profile/', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return (await response.json()).user_name;
    } catch (error) {
        console.error('Error fetching username:', error);
        return null;
    }
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

export async function flip() {
    let allFriends = [];
    let sentInvites = [];
    let receivedInvites = [];
    const currentUsername = await fetchLogin();

    // Redirect to login if username fetch fails or returns null
    if (!currentUsername) {
        console.error("Failed to fetch username or not logged in, redirecting to login");
        history.pushState({}, "", "#login");
        window.routeToPage('story');
        return;
    }

    window.addEventListener('websocketMessage', (event) => {
        const data = event.detail;
        switch (data.type) {
            case 'pending_game_invites':
                receivedInvites = data.invites;
                renderFriends(allFriends, friendSearch.value.trim().toLowerCase(), sentInvites, receivedInvites);
                break;
            case 'new_game_invite_notification':
                receivedInvites.push({
                    invite_id: data.invite_id,
                    from_username: data.from_username,
                    game_mode: data.game_mode,
                    status: 'pending'
                });
                renderFriends(allFriends, friendSearch.value.trim().toLowerCase(), sentInvites, receivedInvites);
                break;
            case 'game_invite_sent':
                sentInvites.push({
                    invite_id: data.invite_id,
                    to_username: data.to_username,
                    status: 'pending'
                });
                renderFriends(allFriends, friendSearch.value.trim().toLowerCase(), sentInvites, receivedInvites);
                break;
            case 'game_invite_accepted':
            case 'game_invite_accepted_notification':
                const gameId = data.game_id;
                sentInvites = sentInvites.map(invite =>
                    invite.invite_id === data.invite_id ? { ...invite, status: 'accepted', game_id: gameId } : invite
                );
                receivedInvites = receivedInvites.map(invite =>
                    invite.invite_id === data.invite_id ? { ...invite, status: 'accepted', game_id: gameId } : invite
                );
                const state = { game_id: gameId, user: currentUsername };
                console.log("Pushing state for online game start:", state);
                history.pushState(state, "", "#game");
                window.routeToPage('game');
                break;
            case 'game_invite_rejected':
                receivedInvites = receivedInvites.filter(invite => invite.invite_id !== data.invite_id);
                renderFriends(allFriends, friendSearch.value.trim().toLowerCase(), sentInvites, receivedInvites);
                break;
            case 'game_invite_rejected_notification':
                sentInvites = sentInvites.filter(invite => invite.invite_id !== data.invite_id);
                renderFriends(allFriends, friendSearch.value.trim().toLowerCase(), sentInvites, receivedInvites);
                break;
            case 'game_invite_error':
                console.error('Game invite error:', data.error);
                break;
        }
    });

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
                const joinBtn = document.createElement('button');
                joinBtn.textContent = 'Join Game';
                joinBtn.classList.add('join-btn');
                joinBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    const state = { game_id: acceptedSentInvite.game_id, user: currentUsername };
                    console.log("Pushing state for host join:", state);
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
                        const state = { game_id: receivedInvite.game_id, user: currentUsername };
                        console.log("Pushing state for guest join:", state);
                        history.pushState(state, "", "#game");
                        window.routeToPage('game');
                    });
                    li.appendChild(joinBtn);
                } else if (receivedInvite.status === 'pending') {
                    const acceptBtn = document.createElement('button');
                    acceptBtn.textContent = 'Accept';
                    acceptBtn.classList.add('accept-btn');
                    acceptBtn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        friendshipSocket.send(JSON.stringify({
                            type: 'accept_game_invite',
                            invite_id: receivedInvite.invite_id
                        }));
                    });

                    const refuseBtn = document.createElement('button');
                    refuseBtn.textContent = 'Refuse';
                    refuseBtn.classList.add('refuse-btn');
                    refuseBtn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        friendshipSocket.send(JSON.stringify({
                            type: 'reject_game_invite',
                            invite_id: receivedInvite.invite_id
                        }));
                    });

                    li.appendChild(acceptBtn);
                    li.appendChild(refuseBtn);
                }
            } else {
                const inviteBtn = document.createElement('button');
                inviteBtn.textContent = hasSentInvite ? 'Already Sent' : 'Invite';
                inviteBtn.classList.add('invite-btn');
                if (!hasSentInvite) {
                    inviteBtn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        friendshipSocket.send(JSON.stringify({
                            type: 'send_game_invite',
                            to_username: friend.username,
                            game_mode: 'online'
                        }));
                    });
                } else {
                    inviteBtn.disabled = true;
                }
                li.appendChild(inviteBtn);
            }

            friendsList.appendChild(li);
        });
    }

    if (friendSearch && friendsList && !friendSearch.dataset.listenerAdded) {
        friendSearch.addEventListener('focus', async function (e) {
            e.stopPropagation();
            if (allFriends.length === 0) {
                try {
                    allFriends = await fetchFriendsList();
                } catch (error) {
                    console.error('Error fetching friends:', error);
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
            playOnlineButton.addEventListener('click', function (e) {
                e.stopPropagation();
                const acceptedSentInvite = sentInvites.find(invite => invite.status === 'accepted' && invite.game_id);
                const acceptedReceivedInvite = receivedInvites.find(invite => invite.status === 'accepted' && invite.game_id);
                const gameInvite = acceptedSentInvite || acceptedReceivedInvite;
                if (gameInvite) {
                    const state = { game_id: gameInvite.game_id, user: currentUsername };
                    console.log("Pushing state for play online:", state);
                    history.pushState(state, "", "#game");
                    window.routeToPage('game');
                } else {
                    console.log("No accepted game invite found.");
                    alert("No active game found. Send or accept an invite to play!");
                }
            });
            playOnlineButton.dataset.listenerAdded = 'true';
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
                        const state = { game_id: data.game_id, user: currentUsername };
                        console.log("Pushing state for local game:", state);
                        history.pushState(state, "", "#game");
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