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
        const data = await response.json();
        console.log('Fetched friends list:', data.friends);
        return data.friends || [];
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
    console.log('Current user:', currentUsername);

    // --- Helper Functions ---
    function setupFlipButton(innerSelector, buttonSelector) {
        const inner = document.querySelector(innerSelector);
        const flipBtn = inner?.querySelector(buttonSelector);
        if (inner && flipBtn && !inner.dataset.listenerAdded) {
            flipBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                inner.classList.toggle('is-flipped');
                console.log(`${innerSelector} flipped`);
            });
            inner.dataset.listenerAdded = 'true';
        } else if (!inner) {
            console.warn(`${innerSelector} not found`);
        } else if (!flipBtn) {
            console.warn(`${buttonSelector} not found in ${innerSelector}`);
        }
    }

    // --- 1v1 Logic ---
    setupFlipButton('.play1v1-inner', '.flip-btn');

    const friendSearch = document.querySelector('#friendSearch');
    const friendsList = document.querySelector('#friendsList');
    const playOnlineButton = document.querySelector('.play-online-button');

    if (!friendSearch || !friendsList) {
        console.error('Missing elements: friendSearch:', !!friendSearch, 'friendsList:', !!friendsList);
    }

    function renderFriends(friends, query, sentInvites, receivedInvites) {
        console.log('Rendering friends with query:', query, 'friends count:', friends.length);
        friendsList.innerHTML = '';
        const filteredFriends = friends.filter(friend =>
            friend.username.toLowerCase().startsWith(query)
        );
        if (filteredFriends.length === 0) {
            friendsList.innerHTML = '<li>No friends found</li>';
            console.log('No friends match query:', query);
            return;
        }
    
        const pendingSentUsernames = new Set(sentInvites.filter(invite => invite.status === 'pending').map(invite => invite.to_username));
        const acceptedSentUsernames = new Map(
            sentInvites
                .filter(invite => invite.status === 'accepted' && invite.game_id && invite.game_mode !== 'tournament')
                .map(invite => [invite.to_username, { game_id: invite.game_id }])
        );
        const inviteStatusMap = new Map(
            receivedInvites.map(invite => [invite.from_username, {
                invite_id: invite.invite_id,
                game_id: invite.game_id,
                status: invite.status,
                game_mode: invite.game_mode,
                tournament_id: invite.tournament_id
            }])
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
                    console.log("Joining 1v1 game as host:", state);
                    history.pushState(state, "", "#game");
                    window.routeToPage('game');
                });
                li.appendChild(joinBtn);
            } else if (receivedInvite) {
                if (receivedInvite.status === 'accepted' && receivedInvite.game_id && receivedInvite.game_mode !== 'tournament') {
                    const joinBtn = document.createElement('button');
                    joinBtn.textContent = 'Join Game';
                    joinBtn.classList.add('join-btn');
                    joinBtn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        const state = { game_id: receivedInvite.game_id, user: currentUsername };
                        console.log("Joining 1v1 game as guest:", state);
                        history.pushState(state, "", "#game");
                        window.routeToPage('game');
                    });
                    li.appendChild(joinBtn);
                } else if (receivedInvite.status === 'pending') {
                    const acceptBtn = document.createElement('button');
                    acceptBtn.textContent = receivedInvite.game_mode === 'tournament' ? 'Join Tournament' : 'Accept';
                    acceptBtn.classList.add('accept-btn');
                    acceptBtn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        if (receivedInvite.game_mode === 'tournament') {
                            console.log(`Accepting tournament invite: ${receivedInvite.invite_id}, tournament: ${receivedInvite.tournament_id}`);
                            friendshipSocket.send(JSON.stringify({
                                type: 'accept_tournament_invite',
                                invite_id: receivedInvite.invite_id,
                                tournament_id: receivedInvite.tournament_id
                            }));
                        } else {
                            console.log(`Accepting 1v1 invite: ${receivedInvite.invite_id}`);
                            friendshipSocket.send(JSON.stringify({
                                type: 'accept_game_invite',
                                invite_id: receivedInvite.invite_id
                            }));
                        }
                    });
    
                    const refuseBtn = document.createElement('button');
                    refuseBtn.textContent = 'Refuse';
                    refuseBtn.classList.add('refuse-btn');
                    refuseBtn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        console.log(`Rejecting invite: ${receivedInvite.invite_id}`);
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
                        console.log(`Sending 1v1 invite to ${friend.username}`);
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
        console.log('Friends list rendered with', filteredFriends.length, 'items');
    }

    if (friendSearch && friendsList && !friendSearch.dataset.listenerAdded) {
        friendSearch.addEventListener('focus', async function (e) {
            e.stopPropagation();
            console.log('Friend search focused');
            if (allFriends.length === 0) {
                try {
                    allFriends = await fetchFriendsList();
                } catch (error) {
                    console.error('Error fetching friends on focus:', error);
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
                    console.log('Friends list hidden');
                }
            }, 100);
        });

        friendSearch.addEventListener('input', function (e) {
            e.stopPropagation();
            const query = this.value.trim().toLowerCase();
            console.log('Search input:', query);
            renderFriends(allFriends, query, sentInvites, receivedInvites);
        });

        friendSearch.dataset.listenerAdded = 'true';

        if (playOnlineButton && !playOnlineButton.dataset.listenerAdded) {
            playOnlineButton.addEventListener('click', function (e) {
                e.stopPropagation();
                const acceptedSentInvite = sentInvites.find(invite => invite.status === 'accepted' && invite.game_id && invite.game_mode !== 'tournament');
                const acceptedReceivedInvite = receivedInvites.find(invite => invite.status === 'accepted' && invite.game_id && invite.game_mode !== 'tournament');
                const gameInvite = acceptedSentInvite || acceptedReceivedInvite;
                if (gameInvite) {
                    const state = { game_id: gameInvite.game_id, user: currentUsername };
                    console.log("Starting 1v1 game via play button:", state);
                    history.pushState(state, "", "#game");
                    window.routeToPage('game');
                } else {
                    console.log("No accepted 1v1 game invite found.");
                    alert("No active 1v1 game found. Send or accept an invite to play!");
                }
            });
            playOnlineButton.dataset.listenerAdded = 'true';
        }

        friendsList.style.display = 'none';
    }

    // --- Local Game Logic ---
    setupFlipButton('.playLocally-inner', '.flip-btn');

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
            console.log(`Creating local game for ${currentUsername}`);
            friendshipSocket.send(JSON.stringify({
                type: 'create_local_game',
                user: currentUsername
            }));
        });
        playLocallyButton.dataset.listenerAdded = 'true';
    }

    // --- Tournament Logic ---
    setupFlipButton('.playTourn-inner', '.flip-btn');

    const tournFriendSearch = document.querySelector('#tournFriendSearch');
    const tournFriendsList = document.querySelector('#tournFriendsList');
    const tournPlayButton = document.querySelector('.playTourn-card .playOnline-button');

    if (!tournFriendSearch || !tournFriendsList) {
        console.error('Missing elements: tournFriendSearch:', !!tournFriendSearch, 'tournFriendsList:', !!tournFriendsList);
    }

    let invitedFriends = new Set();
    let tournamentId = null;
    let participantCount = 1;

    function renderTournamentFriends(friends, query) {
        console.log('Rendering tournament friends with query:', query, 'friends count:', friends.length);
        tournFriendsList.innerHTML = '';
        const filteredFriends = friends.filter(friend =>
            friend.username.toLowerCase().startsWith(query) &&
            friend.username !== currentUsername &&
            !invitedFriends.has(friend.username)
        );

        if (filteredFriends.length === 0 && invitedFriends.size === 0) {
            tournFriendsList.innerHTML = '<li>No friends available to invite</li>';
            console.log('No friends available to invite');
            return;
        }

        filteredFriends.forEach(friend => {
            const li = document.createElement('li');
            li.textContent = friend.username;

            const inviteBtn = document.createElement('button');
            inviteBtn.textContent = 'Invite';
            inviteBtn.classList.add('invite-btn');
            if (invitedFriends.size < 3 && tournamentId) {
                inviteBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    console.log(`Sending tournament invite to ${friend.username} for tournament ${tournamentId}`);
                    friendshipSocket.send(JSON.stringify({
                        type: 'send_game_invite',
                        to_username: friend.username,
                        game_mode: 'tournament',
                        tournament_id: tournamentId
                    }));
                    invitedFriends.add(friend.username);
                    inviteBtn.textContent = 'Invited';
                    inviteBtn.disabled = true;
                    updateTournamentStatus();
                });
            } else {
                inviteBtn.disabled = true;
                inviteBtn.textContent = tournamentId ? 'Max Invites Sent' : 'Create Tournament First';
            }
            li.appendChild(inviteBtn);
            tournFriendsList.appendChild(li);
        });

        updateTournamentStatus();
        console.log('Tournament friends list rendered with', filteredFriends.length, 'items');
    }

    function updateTournamentStatus() {
        const statusDiv = document.querySelector('.tourn-status') || document.createElement('div');
        statusDiv.classList.add('tourn-status');
        statusDiv.textContent = `Participants: ${participantCount}/4 | Invited: ${invitedFriends.size}/3`;
        if (!tournFriendsList.contains(statusDiv)) {
            tournFriendsList.prepend(statusDiv);
        }
        if (participantCount < 4 && invitedFriends.size > 0) {
            const waitingLi = document.createElement('li');
            waitingLi.textContent = 'Waiting for all participants to join...';
            tournFriendsList.appendChild(waitingLi);
        }
        console.log('Tournament status updated:', statusDiv.textContent);
    }

    function resetTournamentUI() {
        tournamentId = null;
        invitedFriends.clear();
        participantCount = 1;
        tournFriendsList.innerHTML = '';
        document.querySelector('.playTourn-inner')?.classList.remove('is-flipped');
        console.log('Tournament UI reset');
    }

    if (tournFriendSearch && tournFriendsList && !tournFriendSearch.dataset.listenerAdded) {
        tournFriendSearch.addEventListener('focus', async function (e) {
            e.stopPropagation();
            console.log('Tournament friend search focused');
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
                    console.log('Tournament friends list hidden');
                }
            }, 100);
        });

        tournFriendSearch.addEventListener('input', function (e) {
            e.stopPropagation();
            const query = this.value.trim().toLowerCase();
            console.log('Tournament search input:', query);
            renderTournamentFriends(allFriends, query);
        });

        tournFriendSearch.dataset.listenerAdded = 'true';
    }

    if (tournPlayButton && !tournPlayButton.dataset.listenerAdded) {
        tournPlayButton.addEventListener('click', function (e) {
            e.stopPropagation();
            if (!tournamentId) {
                console.log(`Creating tournament for ${currentUsername}`);
                friendshipSocket.send(JSON.stringify({
                    type: 'create_tournament',
                    tournament_name: `${currentUsername}'s Tournament`,
                    invited_usernames: []
                }));
            } else {
                console.log('Tournament already created:', tournamentId);
            }
        });
        tournPlayButton.dataset.listenerAdded = 'true';
    }

    // --- WebSocket Message Handler ---
    friendshipSocket.addEventListener('message', (event) => {
        const data = JSON.parse(event.data);
        console.log('Received WebSocket message:', data);
        switch (data.type) {
            case 'game_invite_sent':
                sentInvites.push({
                    to_username: data.to_username,
                    invite_id: data.invite_id,
                    status: 'pending',
                    tournament_id: data.tournament_id || null,
                    game_mode: data.game_mode || 'online'
                });
                renderFriends(allFriends, friendSearch?.value.trim().toLowerCase() || '', sentInvites, receivedInvites);
                if (data.tournament_id) {
                    renderTournamentFriends(allFriends, tournFriendSearch?.value.trim().toLowerCase() || '');
                }
                break;
    
            case 'new_game_invite_notification':
                receivedInvites.push({
                    invite_id: data.invite_id,
                    from_username: data.from_username,
                    status: 'pending',
                    tournament_id: data.tournament_id || null,
                    game_mode: data.game_mode || 'online'
                });
                renderFriends(allFriends, friendSearch?.value.trim().toLowerCase() || '', sentInvites, receivedInvites);
                break;
    
            case 'game_invite_accepted':
                const sentInvite = sentInvites.find(i => i.invite_id === data.invite_id);
                if (sentInvite) {
                    sentInvite.status = 'accepted';
                    sentInvite.game_id = data.game_id;
                    if (sentInvite.game_mode !== 'tournament') {
                        const state = { game_id: data.game_id, user: currentUsername };
                        console.log("Navigating to 1v1 game:", state);
                        history.pushState(state, "", "#game");
                        window.routeToPage('game');
                    } else {
                        console.log(`Tournament invite ${data.invite_id} accepted, waiting for tournament start`);
                    }
                }
                renderFriends(allFriends, friendSearch?.value.trim().toLowerCase() || '', sentInvites, receivedInvites);
                break;
    
            case 'game_invite_accepted_notification':
                const receivedInvite = receivedInvites.find(i => i.invite_id === data.invite_id);
                if (receivedInvite && receivedInvite.game_mode !== 'tournament') {
                    receivedInvite.status = 'accepted';
                    receivedInvite.game_id = data.game_id;
                    const state = {
                        game_id: data.game_id,
                        user: currentUsername,
                        from_username: receivedInvite.from_username,
                        to_username: data.to_username
                    };
                    console.log("Navigating to 1v1 game via notification:", state);
                    history.pushState(state, "", "#game");
                    window.routeToPage('game');
                } else {
                    console.log(`Ignoring game_invite_accepted_notification for tournament invite ${data.invite_id}`);
                }
                break;
    
            case 'game_invite_rejected':
                sentInvites = sentInvites.filter(i => i.invite_id !== data.invite_id);
                renderFriends(allFriends, friendSearch?.value.trim().toLowerCase() || '', sentInvites, receivedInvites);
                renderTournamentFriends(allFriends, tournFriendSearch?.value.trim().toLowerCase() || '');
                break;
    
            case 'local_game_created':
                if (data.user === currentUsername) {
                    const state = {
                        game_id: data.game_id,
                        user: currentUsername,
                        from_username: currentUsername,
                        to_username: null,
                        game_mode: 'local'
                    };
                    console.log("Navigating to local game:", state);
                    history.pushState(state, "", "#game");
                    window.routeToPage('game');
                }
                break;
    
            case 'tournament_created':
                tournamentId = data.tournament_id;
                invitedFriends = new Set(data.invited_usernames);
                participantCount = 1;
                console.log(`Tournament ${tournamentId} created, participantCount set to ${participantCount}`);
                renderTournamentFriends(allFriends, tournFriendSearch?.value.trim().toLowerCase() || '');
                updateTournamentStatus();
                document.querySelector('.playTourn-inner')?.classList.add('is-flipped');
                break;
    
            case 'tournament_invite_accepted':
                if (data.tournament_id === tournamentId) {
                    participantCount++;
                    console.log(`Invite accepted for ${tournamentId}, participantCount incremented to ${participantCount}`);
                    updateTournamentStatus();
                }
                const acceptedInvite = receivedInvites.find(i => i.invite_id === data.invite_id);
                if (acceptedInvite) {
                    acceptedInvite.status = 'accepted';
                }
                renderFriends(allFriends, friendSearch?.value.trim().toLowerCase() || '', sentInvites, receivedInvites);
                break;
    
            case 'tournament_waiting':
                if (data.tournament_id === tournamentId) {
                    participantCount = data.participant_count;
                    console.log(`Tournament ${tournamentId} waiting, participantCount updated to ${participantCount}`);
                    updateTournamentStatus();
                    alert(`Waiting for more players: ${participantCount}/4 participants joined`);
                }
                break;
    
            case 'tournament_match_start':
                console.log(`Tournament match start received for ${data.tournament_id}, players: ${data.player_1} vs ${data.player_2}`);
                if (currentUsername === data.player_1 || currentUsername === data.player_2) {
                    const state = {
                        game_id: data.game_id,
                        user: currentUsername,
                        from_username: data.player_1,
                        to_username: data.player_2,
                        game_mode: 'online',
                        tournament_id: data.tournament_id
                    };
                    console.log("Starting tournament match:", state);
                    history.pushState(state, "", `#game/${data.game_id}`);
                    window.routeToPage('game', { gameId: data.game_id });
                }
                break;
    
            case 'tournament_completed':
                alert(`Tournament ${data.tournament_id} completed! Champion: ${data.champion}`);
                resetTournamentUI();
                break;
    
            case 'tournament_error':
                console.error(`Tournament error: ${data.error} for tournament ${data.tournament_id}`);
                alert(`Tournament error: ${data.error}`);
                if (data.tournament_id === tournamentId) {
                    resetTournamentUI();
                }
                break;
        }
    });

    // --- Additional UI Elements ---
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
}

function reportMatchResult(gameId, winner, tournamentId) {
    console.log(`Reporting match result: game ${gameId}, winner ${winner}, tournament ${tournamentId}`);
    friendshipSocket.send(JSON.stringify({
        'type': 'report_match_result',
        'game_id': gameId,
        'winner': winner,
        'tournament_id': tournamentId
    }));
}

function onGameEnd(gameId, winner, tournamentId) {
    if (tournamentId) {
        reportMatchResult(gameId, winner, tournamentId);
    }
}

export { reportMatchResult, onGameEnd };