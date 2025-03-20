import { friendshipSocket } from "../../globalWebsocket.js";

async function fetchLogin() {
    try {
        const response = await fetch('api/profile/', {
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
        const response = await fetch('api/get_friends/', {
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

    if (!currentUsername) {
        console.error("Failed to fetch username or not logged in, redirecting to login");
        window.routeToPage('story');
        return;
    }

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

    const tournFriendSearch = document.querySelector('#tournFriendSearch');
    const tournFriendsList = document.querySelector('#tournFriendsList');
    // Removed startTournamentButton since the tournament starts automatically

    let invitedFriends = new Set();
    let tournamentId = null;

    function renderTournamentFriends(friends, query) {
        tournFriendsList.innerHTML = '';
        const filteredFriends = friends.filter(friend =>
            friend.username.toLowerCase().startsWith(query) && friend.username !== currentUsername
        );
        if (filteredFriends.length === 0) {
            tournFriendsList.innerHTML = '<li>No friends found</li>';
            return;
        }

        filteredFriends.forEach(friend => {
            const li = document.createElement('li');
            li.textContent = friend.username;

            const inviteBtn = document.createElement('button');
            inviteBtn.textContent = invitedFriends.has(friend.username) ? 'Invited' : 'Invite';
            inviteBtn.classList.add('invite-btn');
            if (!invitedFriends.has(friend.username) && invitedFriends.size < 3) {
                inviteBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    friendshipSocket.send(JSON.stringify({
                        type: 'send_game_invite',
                        to_username: friend.username,
                        game_mode: 'tournament',
                        tournament_id: tournamentId
                    }));
                    invitedFriends.add(friend.username);
                    inviteBtn.textContent = 'Invited';
                    inviteBtn.disabled = true;
                });
            } else {
                inviteBtn.disabled = true;
            }
            li.appendChild(inviteBtn);
            tournFriendsList.appendChild(li);
        });
    }

    if (tournFriendSearch && tournFriendsList && !tournFriendSearch.dataset.listenerAdded) {
        tournFriendSearch.addEventListener('focus', async function (e) {
            e.stopPropagation();
            if (allFriends.length === 0) {
                allFriends = await fetchFriendsList();
            }
            renderTournamentFriends(allFriends, this.value.trim().toLowerCase());
            tournFriendsList.style.display = 'block';
        });

        tournFriendSearch.addEventListener('blur', function (e) {
            setTimeout(() => {
                if (!tournFriendsList.contains(document.activeElement)) {
                    tournFriendsList.style.display = 'none';
                }
            }, 100);
        });

        tournFriendSearch.addEventListener('input', function (e) {
            renderTournamentFriends(allFriends, this.value.trim().toLowerCase());
        });

        tournFriendSearch.dataset.listenerAdded = 'true';
    }

    // WebSocket message handler
    friendshipSocket.addEventListener('message', (event) => {
        const data = JSON.parse(event.data);
        switch (data.type) {
            case 'game_invite_sent':
                sentInvites.push({
                    to_username: data.to_username,
                    invite_id: data.invite_id,
                    status: 'pending',
                    tournament_id: data.tournament_id || null
                });
                renderFriends(allFriends, friendSearch.value.trim().toLowerCase(), sentInvites, receivedInvites);
                if (data.tournament_id) {
                    renderTournamentFriends(allFriends, tournFriendSearch.value.trim().toLowerCase());
                }
                break;
            case 'new_game_invite_notification':
                receivedInvites.push({
                    invite_id: data.invite_id,
                    from_username: data.from_username,
                    status: 'pending',
                    tournament_id: data.tournament_id || null
                });
                renderFriends(allFriends, friendSearch.value.trim().toLowerCase(), sentInvites, receivedInvites);
                break;
            case 'game_invite_accepted':
                const sentInvite = sentInvites.find(i => i.invite_id === data.invite_id);
                if (sentInvite) {
                    sentInvite.status = 'accepted';
                    sentInvite.game_id = data.game_id;
                }
                renderFriends(allFriends, friendSearch.value.trim().toLowerCase(), sentInvites, receivedInvites);
                const stateOnline = { game_id: data.game_id, user: currentUsername };
                history.pushState(stateOnline, "", "#game");
                window.routeToPage('game');
                break;
            case 'game_invite_rejected':
                sentInvites = sentInvites.filter(i => i.invite_id !== data.invite_id);
                renderFriends(allFriends, friendSearch.value.trim().toLowerCase(), sentInvites, receivedInvites);
                break;
            case 'tournament_created':
                tournamentId = data.tournament_id;
                invitedFriends = new Set(data.invited_usernames);
                renderTournamentFriends(allFriends, tournFriendSearch.value.trim().toLowerCase());
                break;
            case 'tournament_invite_accepted':
                if (data.tournament_id === tournamentId) {
                    // Update UI if needed, e.g., show waiting message
                    tournFriendsList.innerHTML = '<li>Waiting for all participants to join...</li>';
                }
                break;
            case 'tournament_match_start':
                const state = {
                    game_id: data.game_id,
                    user: currentUsername,
                    from_username: data.player_1,
                    to_username: data.player_2,
                    game_mode: 'online'
                };
                history.pushState(state, "", "#game");
                window.routeToPage('game');
                break;
            case 'tournament_completed':
                alert(`Tournament ${data.tournament_id} completed! Champion: ${data.champion}`);
                invitedFriends.clear();
                tournamentId = null;
                tournFriendsList.innerHTML = '';
                const buttons = document.querySelector('.buttons');
                const tournCreated = document.querySelector('.tourn-created');
                if (buttons && tournCreated) {
                    tournCreated.style.display = 'none';
                    buttons.style.display = 'flex';
                }
                break;
            case 'tournament_error':
                alert(`Tournament error: ${data.error}`);
                break;
            case 'local_game_created':
                if (data.user === currentUsername) {
                    const stateLocal = {
                        game_id: data.game_id,
                        user: currentUsername,
                        from_username: currentUsername,
                        to_username: null,
                        game_mode: 'local'
                    };
                    history.pushState(stateLocal, "", "#game");
                    window.routeToPage('game');
                }
                break;
        }
    });

    const createTourn = document.querySelector('.create-tourn');
    if (createTourn && !createTourn.dataset.listenerAdded) {
        createTourn.addEventListener('click', function (e) {
            e.stopPropagation();
            friendshipSocket.send(JSON.stringify({
                type: 'create_tournament',
                tournament_name: `${currentUsername}'s Tournament`,
                invited_usernames: []
            }));
            const buttons = document.querySelector('.buttons');
            const tournCreated = document.querySelector('.tourn-created');
            if (buttons && tournCreated) {
                buttons.style.display = 'none';
                tournCreated.style.display = 'flex';
                tournCreated.style.flexDirection = 'column';
                tournCreated.style.alignItems = 'center';
                tournCreated.style.justifyContent = 'center';
                tournFriendSearch.style.display = 'block';
                tournFriendsList.style.display = 'block';
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
            playLocallyButton.disabled = true;

            if (!friendshipSocket || friendshipSocket.readyState !== WebSocket.OPEN) {
                console.error('WebSocket not open, cannot create local game');
                alert('Connection error: Please try again later');
                playLocallyButton.disabled = false;
                return;
            }

            friendshipSocket.send(JSON.stringify({
                type: 'create_local_game',
                user: currentUsername
            }));
        });
        playLocallyButton.dataset.listenerAdded = 'true';
    }
}