import { friendshipSocket } from "../../globalWebsocket.js";
import { fetchFriendsList, fetchLogin, sentInvites, receivedInvites, tournamentId, invitedFriends, participantCount } from "../../routing.js"

let allFriends = [];

export async function flip() {
    const currentUsername = await fetchLogin();
    if (!currentUsername) {
        console.error("Failed to fetch username or not logged in, redirecting to login");
        window.routeToPage('story');
        return;
    }

    // --- Helper Functions ---
    function setupFlipButton(innerSelector, buttonSelector) {
        const inner = document.querySelector(innerSelector);
        const flipBtn = inner?.querySelector(buttonSelector);
        if (inner && flipBtn && !inner.dataset.listenerAdded) {
            flipBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                inner.classList.toggle('is-flipped');
            });
            inner.dataset.listenerAdded = 'true';
        }
    }

    // --- 1v1 Logic ---
    setupFlipButton('.play1v1-inner', '.flip-btn');
    const friendSearch = document.querySelector('#friendSearch');
    const friendsList = document.querySelector('#friendsList');
    const playOnlineButton = document.querySelector('.play-online-button');

    function renderFriends(friends, query) {
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
                joinBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const gameId = acceptedSentInvite?.game_id || receivedInvite.game_id;
                    const state = { game_id: gameId, user: currentUsername };
                    history.pushState(state, "", "#game");
                    window.routeToPage('game');
                });
                li.appendChild(joinBtn);
            } else if (receivedInvite?.status === 'pending') {
                const acceptBtn = document.createElement('button');
                acceptBtn.textContent = receivedInvite.game_mode === 'tournament' ? 'Join Tournament' : 'Accept';
                acceptBtn.classList.add('accept-btn');
                acceptBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    friendshipSocket.send(JSON.stringify({
                        type: receivedInvite.game_mode === 'tournament' ? 'accept_tournament_invite' : 'accept_game_invite',
                        invite_id: receivedInvite.invite_id,
                        ...(receivedInvite.game_mode === 'tournament' && { tournament_id: receivedInvite.tournament_id })
                    }));
                });

                const refuseBtn = document.createElement('button');
                refuseBtn.textContent = 'Refuse';
                refuseBtn.classList.add('refuse-btn');
                refuseBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    friendshipSocket.send(JSON.stringify({
                        type: 'reject_game_invite',
                        invite_id: receivedInvite.invite_id
                    }));
                });

                li.appendChild(acceptBtn);
                li.appendChild(refuseBtn);
            } else {
                const inviteBtn = document.createElement('button');
                inviteBtn.textContent = hasSentInvite ? 'Already Sent' : 'Invite';
                inviteBtn.classList.add('invite-btn');
                if (!hasSentInvite) {
                    inviteBtn.addEventListener('click', (e) => {
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

    if (friendSearch && friendsList) {
        friendSearch.addEventListener('focus', async () => {
            if (!allFriends.length) allFriends = await fetchFriendsList();
            renderFriends(allFriends, friendSearch.value.trim().toLowerCase());
            friendsList.style.display = 'block';
        });

        friendSearch.addEventListener('blur', () => setTimeout(() => {
            if (!friendsList.contains(document.activeElement)) friendsList.style.display = 'none';
        }, 100));

        friendSearch.addEventListener('input', () => renderFriends(allFriends, friendSearch.value.trim().toLowerCase()));
    }

    if (playOnlineButton) {
        playOnlineButton.addEventListener('click', (e) => {
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
        });
    }

    // --- Local Game Logic ---
    setupFlipButton('.playLocally-inner', '.flip-btn');
    const playLocallyButton = document.querySelector('.playLocally-button');
    if (playLocallyButton) {
        playLocallyButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (friendshipSocket.readyState === WebSocket.OPEN) {
                friendshipSocket.send(JSON.stringify({
                    type: 'create_local_game',
                    user: currentUsername
                }));
            } else {
                alert('Connection error: Please try again later');
            }
        });
    }

    // --- Tournament Logic ---
    setupFlipButton('.playTourn-inner', '.flip-btn');
    const tournFriendSearch = document.querySelector('#tournFriendSearch');
    const tournFriendsList = document.querySelector('#tournFriendsList');
    const tournPlayButton = document.querySelector('.playTourn-card .playOnline-button');

    function renderTournamentFriends(friends, query) {
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
                inviteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    friendshipSocket.send(JSON.stringify({
                        type: 'send_game_invite',
                        to_username: friend.username,
                        game_mode: 'tournament',
                        tournament_id: tournamentId
                    }));
                });
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
        tournFriendSearch.addEventListener('focus', async () => {
            if (!allFriends.length) allFriends = await fetchFriendsList();
            renderTournamentFriends(allFriends, tournFriendSearch.value.trim().toLowerCase());
            tournFriendsList.style.display = 'block';
        });

        tournFriendSearch.addEventListener('blur', () => setTimeout(() => {
            if (!tournFriendsList.contains(document.activeElement)) tournFriendsList.style.display = 'none';
        }, 100));

        tournFriendSearch.addEventListener('input', () => renderTournamentFriends(allFriends, tournFriendSearch.value.trim().toLowerCase()));
    }

    if (tournPlayButton) {
        tournPlayButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!tournamentId) {
                friendshipSocket.send(JSON.stringify({
                    type: 'create_tournament',
                    tournament_name: `${currentUsername}'s Tournament`,
                    invited_usernames: []
                }));
            }
        });
    }

    // Update UI on game state changes from routing.js
    window.addEventListener('gameStateUpdate', () => {
        if (friendSearch && friendsList) renderFriends(allFriends, friendSearch.value.trim().toLowerCase());
        if (tournFriendSearch && tournFriendsList) renderTournamentFriends(allFriends, tournFriendSearch.value.trim().toLowerCase());
    });
}

function reportMatchResult(gameId, winner, tournamentId) {
    friendshipSocket.send(JSON.stringify({
        type: 'report_match_result',
        game_id: gameId,
        winner: winner,
        tournament_id: tournamentId
    }));
}

function onGameEnd(gameId, winner, tournamentId) {
    if (tournamentId) reportMatchResult(gameId, winner, tournamentId);
}

export { reportMatchResult, onGameEnd };