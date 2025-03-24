import { friendshipSocket } from "../../globalWebsocket.js";
import { fetchFriendsList, fetchLogin, sentInvites, receivedInvites, tournamentId, invitedFriends, participantCount } from "../../routing.js";

let allFriends = [];

export async function flip() {
    const currentUsername = await fetchLogin();
    if (!currentUsername) {
        console.error("Failed to fetch username or not logged in, redirecting to login");
        window.routeToPage('story');
        return () => {}; // Return empty cleanup if redirected
    }

    const cleanupFunctions = [];

    // --- WebSocket Helper ---
    function sendWebSocketMessage(message) {
        if (friendshipSocket.readyState === WebSocket.OPEN) {
            friendshipSocket.send(JSON.stringify(message));
        } else {
            console.error('WebSocket not open, state:', friendshipSocket.readyState);
            import('../../globalWebsocket.js').then(({ initializeWebSocket }) => {
                initializeWebSocket().catch(err => console.error('Reconnection failed:', err));
            });
        }
    }

    // --- Debounce Helper ---
    function debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // --- Flip Button Setup ---
    function setupFlipButton(innerSelector, buttonSelector) {
        const inner = document.querySelector(innerSelector);
        const flipBtn = inner?.querySelector(buttonSelector);
        if (inner && flipBtn && !inner.dataset.listenerAdded) {
            const handler = (e) => {
                e.stopPropagation();
                inner.classList.toggle('is-flipped');
            };
            flipBtn.addEventListener('click', handler);
            inner.dataset.listenerAdded = 'true';
            cleanupFunctions.push(() => flipBtn.removeEventListener('click', handler));
        }
    }

    // --- 1v1 Logic ---
    setupFlipButton('.play1v1-inner', '.flip-btn');
    const friendSearch = document.querySelector('#friendSearch');
    const friendsList = document.querySelector('#friendsList');
    const playOnlineButton = document.querySelector('.play-online-button');

    function renderFriends(friends, query) {
        if (!friendsList) return;
        friendsList.innerHTML = '';
        const filteredFriends = friends.filter(friend => friend.username.toLowerCase().startsWith(query));
        if (filteredFriends.length === 0) {
            friendsList.innerHTML = '<li>No friends found</li>';
            return;
        }

        const pendingSent = new Set(sentInvites.filter(i => i.status === 'pending').map(i => i.to_username));
        const acceptedSent = new Map(sentInvites.filter(i => i.status === 'accepted' && i.game_id && i.game_mode !== 'tournament').map(i => [i.to_username, { game_id: i.game_id }]));
        const inviteStatus = new Map(receivedInvites.map(i => [i.from_username, i]));

        filteredFriends.forEach(friend => {
            const li = document.createElement('li');
            li.textContent = friend.username;

            const hasSentInvite = pendingSent.has(friend.username);
            const receivedInvite = inviteStatus.get(friend.username);
            const acceptedSentInvite = acceptedSent.get(friend.username);

            if (acceptedSentInvite || (receivedInvite?.status === 'accepted' && receivedInvite.game_id && receivedInvite.game_mode !== 'tournament')) {
                const joinBtn = document.createElement('button');
                joinBtn.textContent = 'Join Game';
                joinBtn.classList.add('join-btn');
                const joinHandler = (e) => {
                    e.stopPropagation();
                    const gameId = acceptedSentInvite?.game_id || receivedInvite.game_id;
                    const state = { game_id: gameId, user: currentUsername };
                    history.pushState(state, "", "#game");
                    window.routeToPage('game');
                };
                joinBtn.addEventListener('click', joinHandler);
                li.appendChild(joinBtn);
                cleanupFunctions.push(() => joinBtn.removeEventListener('click', joinHandler));
            } else if (receivedInvite?.status === 'pending') {
                const acceptBtn = document.createElement('button');
                acceptBtn.textContent = receivedInvite.game_mode === 'tournament' ? 'Join Tournament' : 'Accept';
                acceptBtn.classList.add('accept-btn');
                const acceptHandler = (e) => {
                    e.stopPropagation();
                    sendWebSocketMessage({
                        type: receivedInvite.game_mode === 'tournament' ? 'accept_tournament_invite' : 'accept_game_invite',
                        invite_id: receivedInvite.invite_id,
                        ...(receivedInvite.game_mode === 'tournament' && { tournament_id: receivedInvite.tournament_id })
                    });
                };
                acceptBtn.addEventListener('click', acceptHandler);

                const refuseBtn = document.createElement('button');
                refuseBtn.textContent = 'Refuse';
                refuseBtn.classList.add('refuse-btn');
                const refuseHandler = (e) => {
                    e.stopPropagation();
                    sendWebSocketMessage({
                        type: 'reject_game_invite',
                        invite_id: receivedInvite.invite_id
                    });
                };
                refuseBtn.addEventListener('click', refuseHandler);

                li.appendChild(acceptBtn);
                li.appendChild(refuseBtn);
                cleanupFunctions.push(() => acceptBtn.removeEventListener('click', acceptHandler));
                cleanupFunctions.push(() => refuseBtn.removeEventListener('click', refuseHandler));
            } else {
                const inviteBtn = document.createElement('button');
                inviteBtn.textContent = hasSentInvite ? 'Already Sent' : 'Invite';
                inviteBtn.classList.add('invite-btn');
                if (!hasSentInvite) {
                    const inviteHandler = (e) => {
                        e.stopPropagation();
                        sendWebSocketMessage({
                            type: 'send_game_invite',
                            to_username: friend.username,
                            game_mode: 'online'
                        });
                    };
                    inviteBtn.addEventListener('click', inviteHandler);
                    cleanupFunctions.push(() => inviteBtn.removeEventListener('click', inviteHandler));
                } else {
                    inviteBtn.disabled = true;
                }
                li.appendChild(inviteBtn);
            }
            friendsList.appendChild(li);
        });
    }

    if (friendSearch && friendsList) {
        const focusHandler = async () => {
            if (!allFriends.length) allFriends = await fetchFriendsList();
            renderFriends(allFriends, friendSearch.value.trim().toLowerCase());
            friendsList.style.display = 'block';
        };
        const blurHandler = () => setTimeout(() => {
            if (!friendsList.contains(document.activeElement)) friendsList.style.display = 'none';
        }, 100);
        const inputHandler = debounce(() => renderFriends(allFriends, friendSearch.value.trim().toLowerCase()), 300);

        friendSearch.addEventListener('focus', focusHandler);
        friendSearch.addEventListener('blur', blurHandler);
        friendSearch.addEventListener('input', inputHandler);
        cleanupFunctions.push(() => {
            friendSearch.removeEventListener('focus', focusHandler);
            friendSearch.removeEventListener('blur', blurHandler);
            friendSearch.removeEventListener('input', inputHandler);
        });
    }

    if (playOnlineButton) {
        const playHandler = (e) => {
            e.stopPropagation();
            const gameInvite = sentInvites.find(i => i.status === 'accepted' && i.game_id && i.game_mode !== 'tournament') ||
                              receivedInvites.find(i => i.status === 'accepted' && i.game_id && i.game_mode !== 'tournament');
            if (gameInvite) {
                const state = { game_id: gameInvite.game_id, user: currentUsername };
                history.pushState(state, "", "#game");
                window.routeToPage('game');
            } else {
                alert("No active 1v1 game found. Send or accept an invite to play!");
            }
        };
        playOnlineButton.addEventListener('click', playHandler);
        cleanupFunctions.push(() => playOnlineButton.removeEventListener('click', playHandler));
    }

    // --- Local Game Logic ---
    setupFlipButton('.playLocally-inner', '.flip-btn');
    const playLocallyButton = document.querySelector('.playLocally-button');
    if (playLocallyButton) {
        const localHandler = (e) => {
            e.stopPropagation();
            if (friendshipSocket.readyState === WebSocket.OPEN) {
                sendWebSocketMessage({
                    type: 'create_local_game',
                    user: currentUsername
                });
            } else {
                alert('Connection error: Please try again later');
            }
        };
        playLocallyButton.addEventListener('click', localHandler);
        cleanupFunctions.push(() => playLocallyButton.removeEventListener('click', localHandler));
    }

    // --- Tournament Logic ---
    setupFlipButton('.playTourn-inner', '.flip-btn');
    const tournFriendSearch = document.querySelector('#tournFriendSearch');
    const tournFriendsList = document.querySelector('#tournFriendsList');
    const tournPlayButton = document.querySelector('.playTourn-card .playOnline-button');

    function renderTournamentFriends(friends, query) {
        if (!tournFriendsList) return;
        tournFriendsList.innerHTML = '';
        const filteredFriends = friends.filter(f => f.username.toLowerCase().startsWith(query) && f.username !== currentUsername && !invitedFriends.has(f.username));
        if (!filteredFriends.length && !invitedFriends.size) {
            tournFriendsList.innerHTML = '<li>No friends available to invite</li>';
            return;
        }

        filteredFriends.forEach(friend => {
            const li = document.createElement('li');
            li.textContent = friend.username;
            const inviteBtn = document.createElement('button');
            inviteBtn.textContent = invitedFriends.size < 3 && tournamentId ? 'Invite' : (tournamentId ? 'Max Invites Sent' : 'Create Tournament First');
            inviteBtn.classList.add('invite-btn');
            if (invitedFriends.size < 3 && tournamentId) {
                const inviteHandler = (e) => {
                    e.stopPropagation();
                    sendWebSocketMessage({
                        type: 'send_game_invite',
                        to_username: friend.username,
                        game_mode: 'tournament',
                        tournament_id: tournamentId
                    });
                };
                inviteBtn.addEventListener('click', inviteHandler);
                cleanupFunctions.push(() => inviteBtn.removeEventListener('click', inviteHandler));
            } else {
                inviteBtn.disabled = true;
            }
            li.appendChild(inviteBtn);
            tournFriendsList.appendChild(li);
        });

        const statusDiv = document.createElement('div');
        statusDiv.classList.add('tourn-status');
        statusDiv.textContent = `Participants: ${participantCount}/4 | Invited: ${invitedFriends.size}/3`;
        tournFriendsList.prepend(statusDiv);
    }

    if (tournFriendSearch && tournFriendsList) {
        const tournFocusHandler = async () => {
            if (!allFriends.length) allFriends = await fetchFriendsList();
            renderTournamentFriends(allFriends, tournFriendSearch.value.trim().toLowerCase());
            tournFriendsList.style.display = 'block';
        };
        const tournBlurHandler = () => setTimeout(() => {
            if (!tournFriendsList.contains(document.activeElement)) tournFriendsList.style.display = 'none';
        }, 100);
        const tournInputHandler = debounce(() => renderTournamentFriends(allFriends, tournFriendSearch.value.trim().toLowerCase()), 300);

        tournFriendSearch.addEventListener('focus', tournFocusHandler);
        tournFriendSearch.addEventListener('blur', tournBlurHandler);
        tournFriendSearch.addEventListener('input', tournInputHandler);
        cleanupFunctions.push(() => {
            tournFriendSearch.removeEventListener('focus', tournFocusHandler);
            tournFriendSearch.removeEventListener('blur', tournBlurHandler);
            tournFriendSearch.removeEventListener('input', tournInputHandler);
        });
    }

    if (tournPlayButton) {
        const tournPlayHandler = (e) => {
            e.stopPropagation();
            if (!tournamentId) {
                sendWebSocketMessage({
                    type: 'create_tournament',
                    tournament_name: `${currentUsername}'s Tournament`,
                    invited_usernames: []
                });
            }
        };
        tournPlayButton.addEventListener('click', tournPlayHandler);
        cleanupFunctions.push(() => tournPlayButton.removeEventListener('click', tournPlayHandler));
    }

    // --- Game State Update Listener ---
    const gameStateHandler = () => {
        if (friendSearch && friendsList) renderFriends(allFriends, friendSearch.value.trim().toLowerCase());
        if (tournFriendSearch && tournFriendsList) renderTournamentFriends(allFriends, tournFriendSearch.value.trim().toLowerCase());
    };
    window.addEventListener('gameStateUpdate', gameStateHandler);
    cleanupFunctions.push(() => window.removeEventListener('gameStateUpdate', gameStateHandler));

    // --- Cleanup Function ---
    return () => {
        console.log('Cleaning up play.js');
        cleanupFunctions.forEach(fn => fn());
    };
}

function reportMatchResult(gameId, winner, tournamentId) {
    if (friendshipSocket.readyState === WebSocket.OPEN) {
        friendshipSocket.send(JSON.stringify({
            type: 'report_match_result',
            game_id: gameId,
            winner: winner,
            tournament_id: tournamentId
        }));
    } else {
        console.error('WebSocket not open for reporting match result');
    }
}

function onGameEnd(gameId, winner, tournamentId) {
    if (tournamentId) reportMatchResult(gameId, winner, tournamentId);
}

export { reportMatchResult, onGameEnd };