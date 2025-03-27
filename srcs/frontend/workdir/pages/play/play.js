import { friendshipSocket } from "../../globalWebsocket.js";
import { fetchFriendsList, fetchLogin, tournamentId, invitedFriends, participantCount } from "../../routing.js";

let allFriends = [];

export async function setupMatchModes() {
    const currentUsername = await fetchLogin();
    if (!currentUsername) {
        console.error("Failed to fetch username or not logged in, redirecting to login");
        window.routeToPage('story');
        return () => {};
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

    // --- Fetch Invite Helpers ---
    async function fetchSentInvites() {
        try {
            const response = await fetch('api/get_game_invites_sent/', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });
            if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
            const data = await response.json();
            return data.sent_invites || [];
        } catch (error) {
            console.error('Error fetching sent invites:', error);
            return [];
        }
    }

    async function fetchReceivedInvites() {
        try {
            const response = await fetch('api/get_game_invites_received/', { // Adjust endpoint as needed
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });
            if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
            const data = await response.json();
            return data.received_invites || [];
        } catch (error) {
            console.error('Error fetching received invites:', error);
            return [];
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

    // --- Local Match Logic ---
    const startLocalBtn = document.querySelector('.start-local-btn');
    if (startLocalBtn) {
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
        startLocalBtn.addEventListener('click', localHandler);
        cleanupFunctions.push(() => startLocalBtn.removeEventListener('click', localHandler));
    }

    // --- 1v1 Logic ---
    const start1v1Btn = document.querySelector('.start-1v1-btn');
    const friendSearch = document.querySelector('#friendSearch');
    const friendsList = document.querySelector('#friendsList');

    async function renderFriends(friends, query) {
        if (!friendsList) return;
        friendsList.innerHTML = '';

        // Fetch latest invites on every render
        const latestSentInvites = await fetchSentInvites();
        const latestReceivedInvites = await fetchReceivedInvites();

        const filteredFriends = friends.filter(friend => friend.username.toLowerCase().startsWith(query));
        if (filteredFriends.length === 0) {
            friendsList.innerHTML = '<li>No friends found</li>';
            return;
        }

        const pendingSent = new Set(latestSentInvites.filter(i => i.status === 'pending').map(i => i.to_username));
        const activeGames = new Map(
            latestSentInvites
                .filter(i => i.status === 'accepted' && i.game_id && i.game_mode !== 'tournament' && !i.game_played)
                .map(i => [i.to_username, { game_id: i.game_id }])
        );
        const inviteStatus = new Map(
            latestReceivedInvites
                .filter(i => i.status === 'pending' || (i.status === 'accepted' && i.game_id && !i.game_played))
                .map(i => [i.from_username, i])
        );

        filteredFriends.forEach(friend => {
            const li = document.createElement('li');
            li.textContent = friend.username;

            const receivedInvite = inviteStatus.get(friend.username);
            const activeGame = activeGames.get(friend.username);
            const hasPendingSentInvite = pendingSent.has(friend.username);

            if (activeGame || (receivedInvite?.status === 'accepted' && receivedInvite.game_id)) {
                const joinBtn = document.createElement('button');
                joinBtn.textContent = 'Join Game';
                joinBtn.classList.add('join-btn');
                const joinHandler = (e) => {
                    e.stopPropagation();
                    const gameId = activeGame?.game_id || receivedInvite.game_id;
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
            } else if (!hasPendingSentInvite) {
                const inviteBtn = document.createElement('button');
                inviteBtn.textContent = 'Invite';
                inviteBtn.classList.add('invite-btn');
                const inviteHandler = (e) => {
                    e.stopPropagation();
                    inviteBtn.disabled = true;
                    inviteBtn.textContent = 'Pending';
                    sendWebSocketMessage({
                        type: 'send_game_invite',
                        to_username: friend.username,
                        game_mode: 'online'
                    });
                };
                inviteBtn.addEventListener('click', inviteHandler, { once: true });
                li.appendChild(inviteBtn);
                cleanupFunctions.push(() => inviteBtn.removeEventListener('click', inviteHandler));
            }
            friendsList.appendChild(li);
        });
    }

    if (start1v1Btn && friendSearch && friendsList) {
        const start1v1Handler = async (e) => {
            e.stopPropagation();
            const frontFace = document.querySelector('.play1v1-front');
            const backFace = document.querySelector('.play1v1-back');
            frontFace.style.display = 'none';
            backFace.style.display = 'flex';
            if (!allFriends.length) allFriends = await fetchFriendsList();
            await renderFriends(allFriends, friendSearch.value.trim().toLowerCase());
            friendsList.style.display = 'block';
            start1v1Btn.textContent = 'Waiting for Opponent...';
            start1v1Btn.disabled = true;
        };
        start1v1Btn.addEventListener('click', start1v1Handler);
        cleanupFunctions.push(() => start1v1Btn.removeEventListener('click', start1v1Handler));

        const focusHandler = async () => {
            if (!allFriends.length) allFriends = await fetchFriendsList();
            await renderFriends(allFriends, friendSearch.value.trim().toLowerCase());
            friendsList.style.display = 'block';
        };
        const blurHandler = () => setTimeout(() => {
            if (!friendsList.contains(document.activeElement)) friendsList.style.display = 'none';
        }, 100);
        const inputHandler = debounce(async () => await renderFriends(allFriends, friendSearch.value.trim().toLowerCase()), 300);

        friendSearch.addEventListener('focus', focusHandler);
        friendSearch.addEventListener('blur', blurHandler);
        friendSearch.addEventListener('input', inputHandler);
        cleanupFunctions.push(() => {
            friendSearch.removeEventListener('focus', focusHandler);
            friendSearch.removeEventListener('blur', blurHandler);
            friendSearch.removeEventListener('input', inputHandler);
        });

        const debouncedGameStateHandler = debounce(async () => {
            if (friendsList.style.display === 'block') {
                await renderFriends(allFriends, friendSearch.value.trim().toLowerCase());
            }
        }, 300);
        window.addEventListener('gameStateUpdate', debouncedGameStateHandler);
        cleanupFunctions.push(() => window.removeEventListener('gameStateUpdate', debouncedGameStateHandler));
    }

    // --- Tournament Logic ---
    const startTournBtn = document.querySelector('.start-tourn-btn');
    const tournFriendSearch = document.querySelector('#tournFriendSearch');
    const tournFriendsList = document.querySelector('#tournFriendsList');

    async function renderTournamentFriends(friends, query) {
        if (!tournFriendsList) return;
        tournFriendsList.innerHTML = '';

        const latestSentInvites = await fetchSentInvites();
        const latestReceivedInvites = await fetchReceivedInvites();

        const pendingSent = new Set(latestSentInvites.filter(i => i.status === 'pending' && i.game_mode === 'tournament').map(i => i.to_username));
        const filteredFriends = friends.filter(f => 
            f.username.toLowerCase().startsWith(query) && 
            f.username !== currentUsername && 
            !invitedFriends.has(f.username) && 
            !pendingSent.has(f.username)
        );

        if (!filteredFriends.length && !invitedFriends.size) {
            tournFriendsList.innerHTML = '<li>No friends available to invite</li>';
            return;
        }

        filteredFriends.forEach(friend => {
            const li = document.createElement('li');
            li.textContent = friend.username;
            const inviteBtn = document.createElement('button');
            inviteBtn.textContent = invitedFriends.size < 3 && tournamentId ? 'Invite' : (tournamentId ? 'Max Invites Sent' : 'Waiting for Tournament');
            inviteBtn.classList.add('invite-btn');
            if (invitedFriends.size < 3 && tournamentId) {
                const inviteHandler = (e) => {
                    e.stopPropagation();
                    inviteBtn.disabled = true;
                    inviteBtn.textContent = 'Pending';
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

    if (startTournBtn && tournFriendSearch && tournFriendsList) {
        const startTournHandler = async (e) => {
            e.stopPropagation();
            const frontFace = document.querySelector('.playTourn-front');
            const backFace = document.querySelector('.playTourn-back');
            frontFace.style.display = 'none';
            backFace.style.display = 'flex';
            if (!tournamentId) {
                startTournBtn.disabled = true;
                startTournBtn.textContent = 'Creating...';
                sendWebSocketMessage({
                    type: 'create_tournament',
                    tournament_name: `${currentUsername}'s Tournament`,
                    invited_usernames: []
                });
            } else if (participantCount === 4) {
                sendWebSocketMessage({
                    type: 'start_tournament',
                    tournament_id: tournamentId
                });
                startTournBtn.textContent = 'Starting...';
                startTournBtn.disabled = true;
            }
            if (!allFriends.length) allFriends = await fetchFriendsList();
            await renderTournamentFriends(allFriends, tournFriendSearch.value.trim().toLowerCase());
            tournFriendsList.style.display = 'block';
        };
        startTournBtn.addEventListener('click', startTournHandler);
        cleanupFunctions.push(() => startTournBtn.removeEventListener('click', startTournHandler));

        const focusHandler = async () => {
            if (!allFriends.length) allFriends = await fetchFriendsList();
            await renderTournamentFriends(allFriends, tournFriendSearch.value.trim().toLowerCase());
            tournFriendsList.style.display = 'block';
        };
        const blurHandler = () => setTimeout(() => {
            if (!tournFriendsList.contains(document.activeElement)) tournFriendsList.style.display = 'none';
        }, 100);
        const inputHandler = debounce(async () => await renderTournamentFriends(allFriends, tournFriendSearch.value.trim().toLowerCase()), 300);

        tournFriendSearch.addEventListener('focus', focusHandler);
        tournFriendSearch.addEventListener('blur', blurHandler);
        tournFriendSearch.addEventListener('input', inputHandler);
        cleanupFunctions.push(() => {
            tournFriendSearch.removeEventListener('focus', focusHandler);
            tournFriendSearch.removeEventListener('blur', blurHandler);
            tournFriendSearch.removeEventListener('input', inputHandler);
        });

        const debouncedTournGameStateHandler = debounce(async () => {
            if (tournFriendsList.style.display === 'block') {
                await renderTournamentFriends(allFriends, tournFriendSearch.value.trim().toLowerCase());
            }
        }, 300);
        window.addEventListener('gameStateUpdate', debouncedTournGameStateHandler);
        cleanupFunctions.push(() => window.removeEventListener('gameStateUpdate', debouncedTournGameStateHandler));
    }

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