// frontend/game.js
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

export async function game() {
    let paddle1_x, paddle2_x, ball_bounds, paddle_bounds_x, paddle_bounds_y;
    let score_1 = 0, score_2 = 0;
    let initialStateReceived = false;
    let pastPositions = [];
    let keyState = {};
    let websocket = null;
    let gameId = history.state?.game_id;
    let player = history.state?.user;
    let gameMode = null;
    let reconnectionAttempts = 0;
    const maxReconnectionAttempts = 5;
    let opponentName = null;

    if (!player) {
        player = await fetchLogin();
        if (!player) {
            console.error("Failed to fetch username or not logged in, redirecting to login");
            history.pushState({}, "", "#login");
            window.routeToPage('story');
            return;
        }
    }

    console.log("Connecting to game ID:", gameId, "Player:", player);

    if (!gameId) {
        console.error("No game ID found in history.state", { gameId, player });
        history.pushState({}, "", "#play");
        window.routeToPage('play');
        return;
    }

    const preGame = document.querySelector(".Pre-Game");
    const canvas = document.getElementById("pong");
    const postGame = document.querySelector(".Post-Game");
    const myScore = document.querySelector(".MyScore .Digits");
    const opponentScore = document.querySelector(".OpponentScore .Digits");
    const myUsername = document.querySelector(".MyScore .MyUsername");
    const opponentUsername = document.querySelector(".OpponentScore .OpponentUsername");
    const playAgain = document.querySelector(".PlayAgain");

    if (!preGame || !canvas || !postGame) {
        console.error("Game page DOM elements not found, aborting:", { preGame, canvas, postGame });
        history.pushState({}, "", "#play");
        window.routeToPage('play');
        return;
    }

    preGame.style.display = "flex";
    preGame.textContent = "Connecting to game...";
    canvas.style.display = "none";
    postGame.style.display = "none";

    function initializeCanvas() {
        if (!canvas) {
            console.error("Canvas element 'pong' not found");
            return null;
        }
        const ctx = canvas.getContext("2d");
        const offScreenCanvas = document.createElement("canvas");
        offScreenCanvas.width = canvas.width;
        offScreenCanvas.height = canvas.height;
        const offScreenCtx = offScreenCanvas.getContext("2d");

        colorBackground(offScreenCtx, offScreenCanvas);
        drawScore(offScreenCtx, offScreenCanvas, 0, 0);

        return { canvas, ctx, offScreenCanvas, offScreenCtx };
    }

    function colorBackground(ctx, canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    function drawPaddles(ctx, width, height, left_x, left_y, right_x, right_y, bounds_x, bounds_y) {
        ctx.fillStyle = "white";
        const paddleWidth = bounds_x * width;
        const paddleHeight = bounds_y * height * 2;

        ctx.beginPath();
        ctx.moveTo(left_x * width - paddleWidth / 2, left_y * height - paddleHeight / 2);
        ctx.lineTo(left_x * width + paddleWidth / 2, left_y * height - paddleHeight / 2);
        ctx.lineTo(left_x * width + paddleWidth / 2, left_y * height + paddleHeight / 2);
        ctx.lineTo(left_x * width - paddleWidth / 2, left_y * height + paddleHeight / 2);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.arc(left_x * width, left_y * height - paddleHeight / 4, paddleWidth / 4, 0, Math.PI * 2);
        ctx.fillStyle = "black";
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(left_x * width - paddleWidth / 2, left_y * height + paddleHeight / 4);
        ctx.lineTo(left_x * width - paddleWidth / 2 - 10, left_y * height + paddleHeight / 2);
        ctx.lineTo(left_x * width - paddleWidth / 2, left_y * height + paddleHeight / 2);
        ctx.closePath();
        ctx.fillStyle = "white";
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(left_x * width - paddleWidth / 2, left_y * height - paddleHeight / 4);
        ctx.lineTo(left_x * width - paddleWidth / 2 - 10, left_y * height - paddleHeight / 2);
        ctx.lineTo(left_x * width - paddleWidth / 2, left_y * height - paddleHeight / 2);
        ctx.closePath();
        ctx.fillStyle = "white";
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(right_x * width - paddleWidth / 2, right_y * height - paddleHeight / 2);
        ctx.lineTo(right_x * width + paddleWidth / 2, right_y * height - paddleHeight / 2);
        ctx.lineTo(right_x * width + paddleWidth / 2, right_y * height + paddleHeight / 2);
        ctx.lineTo(right_x * width - paddleWidth / 2, right_y * height + paddleHeight / 2);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.arc(right_x * width, right_y * height - paddleHeight / 4, paddleWidth / 4, 0, Math.PI * 2);
        ctx.fillStyle = "black";
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(right_x * width + paddleWidth / 2, right_y * height + paddleHeight / 4);
        ctx.lineTo(right_x * width + paddleWidth / 2 + 10, right_y * height + paddleHeight / 2);
        ctx.lineTo(right_x * width + paddleWidth / 2, right_y * height + paddleHeight / 2);
        ctx.closePath();
        ctx.fillStyle = "white";
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(right_x * width + paddleWidth / 2, right_y * height - paddleHeight / 4);
        ctx.lineTo(right_x * width + paddleWidth / 2 + 10, right_y * height - paddleHeight / 2);
        ctx.lineTo(right_x * width + paddleWidth / 2, right_y * height - paddleHeight / 2);
        ctx.closePath();
        ctx.fillStyle = "white";
        ctx.fill();
    }

    function drawBall(ctx, width, height, ball_x, ball_y, radius, pastPositions) {
        pastPositions.length = 0;
        pastPositions.push({ x: ball_x, y: ball_y });

        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * 2 * Math.PI;
            const randomFactor = 0.7 + Math.random() * 0.3;
            const x = ball_x * width + radius * width * randomFactor * Math.cos(angle);
            const y = ball_y * height + radius * width * randomFactor * Math.sin(angle);
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.fillStyle = "white";
        ctx.fill();
    }

    function drawScore(ctx, width, score1, score2) {
        ctx.font = "30px Arial";
        ctx.fillStyle = "white";
        ctx.fillText(score1, width / 4, 50);
        ctx.fillText(score2, (width * 3) / 4, 50);
    }

    function drawGame(game, ctx, canvas, offScreenCanvas) {
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(offScreenCanvas, 0, 0);

        drawPaddles(ctx, width, height, paddle1_x, game.paddle1_y, paddle2_x, game.paddle2_y, paddle_bounds_x, paddle_bounds_y);
        drawBall(ctx, width, height, game.ball_x, game.ball_y, ball_bounds, pastPositions);
        drawScore(ctx, width, score_1, score_2);
    }

    const canvasSetup = initializeCanvas();
    if (!canvasSetup) return;
    const { ctx, offScreenCanvas, offScreenCtx } = canvasSetup;

    function updateAndDrawGame(game) {
        drawGame(game, ctx, canvas, offScreenCanvas);
    }

    function handleKeyDown(event) {
        if (gameMode === 'local') {
            if (event.key === 'w' && !keyState['w']) {
                keyState['w'] = true;
                websocket.send(JSON.stringify({ 'action': 'wStart', 'player_id': player, 'paddle': 'player1' }));
            } else if (event.key === 's' && !keyState['s']) {
                keyState['s'] = true;
                websocket.send(JSON.stringify({ 'action': 'sStart', 'player_id': player, 'paddle': 'player1' }));
            } else if (event.key === 'ArrowUp' && !keyState['ArrowUp']) {
                keyState['ArrowUp'] = true;
                websocket.send(JSON.stringify({ 'action': 'upStart', 'player_id': player, 'paddle': 'player2' }));
            } else if (event.key === 'ArrowDown' && !keyState['ArrowDown']) {
                keyState['ArrowDown'] = true;
                websocket.send(JSON.stringify({ 'action': 'downStart', 'player_id': player, 'paddle': 'player2' }));
            }
        } else {
            if (event.key === 'ArrowUp' && !keyState['ArrowUp']) {
                keyState['ArrowUp'] = true;
                websocket.send(JSON.stringify({ 'action': 'upStart', 'player_id': player }));
            } else if (event.key === 'ArrowDown' && !keyState['ArrowDown']) {
                keyState['ArrowDown'] = true;
                websocket.send(JSON.stringify({ 'action': 'downStart', 'player_id': player }));
            }
        }
    }

    function handleKeyUp(event) {
        if (gameMode === 'local') {
            if (event.key === 'w' && keyState['w']) {
                keyState['w'] = false;
                websocket.send(JSON.stringify({ 'action': 'wStop', 'player_id': player, 'paddle': 'player1' }));
            } else if (event.key === 's' && keyState['s']) {
                keyState['s'] = false;
                websocket.send(JSON.stringify({ 'action': 'sStop', 'player_id': player, 'paddle': 'player1' }));
            } else if (event.key === 'ArrowUp' && keyState['ArrowUp']) {
                keyState['ArrowUp'] = false;
                websocket.send(JSON.stringify({ 'action': 'upStop', 'player_id': player, 'paddle': 'player2' }));
            } else if (event.key === 'ArrowDown' && keyState['ArrowDown']) {
                keyState['ArrowDown'] = false;
                websocket.send(JSON.stringify({ 'action': 'downStop', 'player_id': player, 'paddle': 'player2' }));
            }
        } else {
            if (event.key === 'ArrowUp' && keyState['ArrowUp']) {
                keyState['ArrowUp'] = false;
                websocket.send(JSON.stringify({ 'action': 'upStop', 'player_id': player }));
            } else if (event.key === 'ArrowDown' && keyState['ArrowDown']) {
                keyState['ArrowDown'] = false;
                websocket.send(JSON.stringify({ 'action': 'downStop', 'player_id': player }));
            }
        }
    }

    function attachKeyListeners() {
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);
    }

    function resetGame() {
        paddle1_x = undefined;
        paddle2_x = undefined;
        ball_bounds = undefined;
        paddle_bounds_x = undefined;
        paddle_bounds_y = undefined;
        score_1 = 0;
        score_2 = 0;
        initialStateReceived = false;
        pastPositions = [];
        keyState = {};
        gameMode = null;
        reconnectionAttempts = 0;
        opponentName = null;

        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);

        if (websocket) {
            if (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING) {
                websocket.close(1000, "Game reset");
            }
            websocket = null;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        offScreenCtx.clearRect(0, 0, offScreenCanvas.width, offScreenCanvas.height);

        preGame.style.display = "flex";
        canvas.style.display = "none";
        postGame.style.display = "none";
    }

    function cleanup(winner = null) {
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
        keyState = {};

        if (websocket) {
            if (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING) {
                websocket.close(1000, "Game ended");
            }
            websocket = null;
        }

        if (myUsername) myUsername.textContent = player;
        if (myScore) myScore.textContent = score_1;
        if (opponentUsername) opponentUsername.textContent = opponentName || (gameMode === 'local' ? "Local Opponent" : "Online Opponent");
        if (opponentScore) opponentScore.textContent = score_2;

        const postGameMessage = document.querySelector(".Post-Game h2");
        if (postGameMessage) {
            postGameMessage.textContent = "Game Over!"
        }

        preGame.style.display = "none";
        canvas.style.display = "none";
        postGame.style.display = "flex";

        setTimeout(() => {
            window.location.hash = '#play';
            window.routeToPage('play');
        }, 5000);

        if (playAgain) {
            playAgain.addEventListener("click", () => {
                fetch('api/create_game/', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: ''
                })
                    .then(response => response.json().then(data => ({ ok: response.ok, data })))
                    .then(({ ok, data }) => {
                        if (ok && data.game_id) {
                            gameId = data.game_id;
                            resetGame();
                            connectWebSocket();
                        } else {
                            console.error("Game creation failed:", data);
                            window.location.hash = '#play';
                        }
                    })
                    .catch(error => {
                        console.error("Error creating new game:", error);
                        window.location.hash = '#play';
                    });
            }, { once: true });
        }
    }

    function connectWebSocket() {
        if (websocket && (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING)) {
            console.warn("Existing WebSocket detected, skipping new connection");
            return;
        }

        const wsUrl = `wss://${window.location.host}/ws/pong/${gameId}/`;
        console.log("Attempting to connect to WebSocket at:", wsUrl);
        websocket = new WebSocket(wsUrl);

        websocket.onopen = function () {
            console.log('WebSocket opened for player:', player);
            reconnectionAttempts = 0;
            preGame.textContent = "Connected, waiting for game state...";
            websocket.send(JSON.stringify({ 'action': 'connect', 'player_id': player }));
            attachKeyListeners();
        };

        websocket.onmessage = function (event) {
            let game_state = JSON.parse(event.data);
            console.log("WebSocket message:", game_state); // Debug incoming messages

            if (game_state.error) {
                console.error("Server error:", game_state.error);
                preGame.textContent = game_state.error === 'Game not found or not yet accepted'
                    ? "Waiting for opponent to join..."
                    : "Error: " + game_state.error;
                return;
            }

            if (game_state.message) {
                preGame.textContent = game_state.message;
            }

            if (game_state.type === 'initial_state' && !initialStateReceived) {
                paddle1_x = game_state.paddle1_x;
                paddle2_x = game_state.paddle2_x;
                ball_bounds = game_state.ball_bounds;
                paddle_bounds_x = game_state.paddle_bounds_x;
                paddle_bounds_y = game_state.paddle_bounds_y;
                gameMode = game_state.game_opponent;
                opponentName = game_state.player_1 === player ? game_state.player_2 : game_state.player_1;
                initialStateReceived = true;
                preGame.style.display = "none";
                canvas.style.display = "flex";
            }

            // Update scores
            if (game_state.score1 !== undefined) score_1 = game_state.score1;
            if (game_state.score2 !== undefined) score_2 = game_state.score2;

            // Check for game end
            if (game_state.status === 'done') {
                const winner = game_state.winner || (score_1 >= 7 ? game_state.player_1 : game_state.player_2);
                console.log(`Game ended: winner=${winner}, scores=${score_1}-${score_2}`);
                cleanup(winner);
                return;
            }

            // Only update game if still active
            updateAndDrawGame({
                'ball_x': game_state.ball_x,
                'ball_y': game_state.ball_y,
                'paddle1_y': game_state.paddle1_y,
                'paddle2_y': game_state.paddle2_y,
                'score1': score_1,
                'score2': score_2,
                'paddle1_x': paddle1_x,
                'paddle2_x': paddle2_x,
                'ball_bounds': ball_bounds,
                'paddle_bounds_x': paddle_bounds_x,
                'paddle_bounds_y': paddle_bounds_y,
            });
        };

        websocket.onerror = function (event) {
            console.error('WebSocket error:', event);
            preGame.textContent = "Connection error, attempting to reconnect...";
        };

        websocket.onclose = function (event) {
            console.log('WebSocket closed with code:', event.code, 'reason:', event.reason);
            if (!initialStateReceived && reconnectionAttempts < maxReconnectionAttempts) {
                reconnectionAttempts++;
                preGame.textContent = `Connection lost, reconnecting (${reconnectionAttempts}/${maxReconnectionAttempts})...`;
                setTimeout(() => connectWebSocket(), 1000 * reconnectionAttempts);
            } else if (!initialStateReceived) {
                preGame.textContent = "Failed to connect after multiple attempts, please refresh.";
                setTimeout(() => {
                    window.location.hash = '#play';
                }, 3000);
            } else if (score_1 >= 7 || score_2 >= 7) {
                // Game ended due to server closure
                const winner = score_1 >= 7 ? (player === game_state.player_1 ? player : opponentName) : (player === game_state.player_2 ? player : opponentName);
                cleanup(winner);
            }
        };
    }

    connectWebSocket();

    setTimeout(() => {
        if (!initialStateReceived && (!websocket || websocket.readyState !== WebSocket.OPEN)) {
            console.warn("Initial state not received, attempting reconnection...");
            preGame.textContent = "Game not started yet, reconnecting...";
            connectWebSocket();
        }
    }, gameMode === 'online' ? 10000 : 5000);
}

export function cleanup() {
    if (typeof resetGame === 'function') {
        resetGame();
    } else {
        console.warn("resetGame not defined, performing basic cleanup");
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
        if (websocket && (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING)) {
            websocket.close(1000, "Manual cleanup");
        }
    }
}