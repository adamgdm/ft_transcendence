export function game() {
    // Game state variables
    let paddle1_x;
    let paddle2_x;
    let ball_bounds;
    let paddle_bounds_x;
    let paddle_bounds_y;
    let score_1 = 0;
    let score_2 = 0;
    let initialStateReceived = false;
    let pastPositions = [];
    let keyState = {};
    let websocket = null;
    let gameId = history.state?.game_id;
    const player = history.state?.user;
    let gameMode = null; // Will be set to 'local' or 'online'

    console.log("Connecting to game ID:", gameId, "Player:", player);

    function create_game(opponent_username) {
        let body;
        if (!opponent_username || opponent_username.trim() === '') {
            body = ``; // No opponent, create a random game
        } else {
            body = `player=${encodeURIComponent(opponent_username)}`; // Create game with specified opponent
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

    if (!gameId || !player) {
        console.error("No game ID or player found in history.state", { gameId, player });
        return;
    }

    // DOM elements
    const preGame = document.querySelector(".Pre-Game");
    const canvas = document.getElementById("pong");
    const postGame = document.querySelector(".Post-Game");
    const myScore = document.querySelector(".MyScore .Digits");
    const opponentScore = document.querySelector(".OpponentScore .Digits");
    const myUsername = document.querySelector(".MyScore .MyUsername");
    const opponentUsername = document.querySelector(".OpponentScore .OpponentUsername");
    const playAgain = document.querySelector(".PlayAgain");

    // Set initial visibility
    preGame.style.display = "flex";
    canvas.style.display = "none";
    postGame.style.display = "none";

    // Canvas initialization
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

        // Set transparent background on the off-screen canvas
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
        // Clear past positions to avoid multiple balls
        pastPositions.length = 0; // Ensure only the current position is used
        pastPositions.push({ x: ball_x, y: ball_y });

        // Draw the ball trail (optional, comment out if not needed)
        for (let i = pastPositions.length - 1; i >= 0; i--) {
            ctx.beginPath();
            const trailRadius = radius * width * (0.5 + 0.5 * i / pastPositions.length);
            const alpha = i / pastPositions.length;
            const color = `rgba(${255 - 200 * alpha}, ${100 - 100 * alpha}, 0, ${alpha})`;
            ctx.arc(pastPositions[i].x * width, pastPositions[i].y * height, trailRadius, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
        }

        // Draw the main ball
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

        // Clear the on-screen canvas to ensure transparency
        ctx.clearRect(0, 0, width, height);

        // Draw the off-screen canvas (which contains the score and transparent background)
        ctx.drawImage(offScreenCanvas, 0, 0);

        // Draw game elements on top
        drawPaddles(ctx, width, height, paddle1_x, game.paddle1_y, paddle2_x, game.paddle2_y, paddle_bounds_x, paddle_bounds_y);
        drawBall(ctx, width, height, game.ball_x, game.ball_y, ball_bounds, pastPositions);
        drawScore(ctx, width, score_1, score_2);
    }

    const canvasSetup = initializeCanvas();
    if (!canvasSetup) return; // Exit if canvas initialization fails
    const { ctx, offScreenCanvas, offScreenCtx } = canvasSetup;

    function updateAndDrawGame(game) {
        // Update pastPositions (already managed in drawBall to prevent multiple balls)
        drawGame(game, ctx, canvas, offScreenCanvas);
    }

    // Define key event handlers
    function handleKeyDown(event) {
        console.log("Key down event:", event.key);
        if (gameMode === 'local') {
            // Local mode: W/S for left paddle (player1), ArrowUp/ArrowDown for right paddle (player2)
            if (event.key === 'w' && !keyState['w']) {
                keyState['w'] = true;
                const message = {
                    'action': 'wStart',
                    'player_id': player,
                    'paddle': 'player1' // Explicitly specify which paddle
                };
                console.log("Sending message:", JSON.stringify(message));
                websocket.send(JSON.stringify(message));
            } else if (event.key === 's' && !keyState['s']) {
                keyState['s'] = true;
                const message = {
                    'action': 'sStart',
                    'player_id': player,
                    'paddle': 'player1'
                };
                console.log("Sending message:", JSON.stringify(message));
                websocket.send(JSON.stringify(message));
            } else if (event.key === 'ArrowUp' && !keyState['ArrowUp']) {
                keyState['ArrowUp'] = true;
                const message = {
                    'action': 'upStart',
                    'player_id': player,
                    'paddle': 'player2'
                };
                console.log("Sending message:", JSON.stringify(message));
                websocket.send(JSON.stringify(message));
            } else if (event.key === 'ArrowDown' && !keyState['ArrowDown']) {
                keyState['ArrowDown'] = true;
                const message = {
                    'action': 'downStart',
                    'player_id': player,
                    'paddle': 'player2'
                };
                console.log("Sending message:", JSON.stringify(message));
                websocket.send(JSON.stringify(message));
            }
        } else {
            // Online mode: ArrowUp/ArrowDown for the player's paddle
            if (event.key === 'ArrowUp' && !keyState['ArrowUp']) {
                keyState['ArrowUp'] = true;
                const message = {
                    'action': 'upStart',
                    'player_id': player
                };
                console.log("Sending message:", JSON.stringify(message));
                websocket.send(JSON.stringify(message));
            } else if (event.key === 'ArrowDown' && !keyState['ArrowDown']) {
                keyState['ArrowDown'] = true;
                const message = {
                    'action': 'downStart',
                    'player_id': player
                };
                console.log("Sending message:", JSON.stringify(message));
                websocket.send(JSON.stringify(message));
            }
        }
    }

    function handleKeyUp(event) {
        console.log("Key up event:", event.key);
        if (gameMode === 'local') {
            // Local mode: W/S for left paddle (player1), ArrowUp/ArrowDown for right paddle (player2)
            if (event.key === 'w' && keyState['w']) {
                keyState['w'] = false;
                const message = {
                    'action': 'wStop',
                    'player_id': player,
                    'paddle': 'player1'
                };
                console.log("Sending message:", JSON.stringify(message));
                websocket.send(JSON.stringify(message));
            } else if (event.key === 's' && keyState['s']) {
                keyState['s'] = false;
                const message = {
                    'action': 'sStop',
                    'player_id': player,
                    'paddle': 'player1'
                };
                console.log("Sending message:", JSON.stringify(message));
                websocket.send(JSON.stringify(message));
            } else if (event.key === 'ArrowUp' && keyState['ArrowUp']) {
                keyState['ArrowUp'] = false;
                const message = {
                    'action': 'upStop',
                    'player_id': player,
                    'paddle': 'player2'
                };
                console.log("Sending message:", JSON.stringify(message));
                websocket.send(JSON.stringify(message));
            } else if (event.key === 'ArrowDown' && keyState['ArrowDown']) {
                keyState['ArrowDown'] = false;
                const message = {
                    'action': 'downStop',
                    'player_id': player,
                    'paddle': 'player2'
                };
                console.log("Sending message:", JSON.stringify(message));
                websocket.send(JSON.stringify(message));
            }
        } else {
            // Online mode: ArrowUp/ArrowDown for the player's paddle
            if (event.key === 'ArrowUp' && keyState['ArrowUp']) {
                keyState['ArrowUp'] = false;
                const message = {
                    'action': 'upStop',
                    'player_id': player
                };
                console.log("Sending message:", JSON.stringify(message));
                websocket.send(JSON.stringify(message));
            } else if (event.key === 'ArrowDown' && keyState['ArrowDown']) {
                keyState['ArrowDown'] = false;
                const message = {
                    'action': 'downStop',
                    'player_id': player
                };
                console.log("Sending message:", JSON.stringify(message));
                websocket.send(JSON.stringify(message));
            }
        }
    }

    // Function to attach event listeners
    function attachKeyListeners() {
        console.log("Attaching key event listeners");
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);
    }

    // Function to reset the game state and ensure WebSocket is fully closed
    function resetGame() {
        // Reset game state variables
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
        gameMode = null; // Reset game mode

        // Remove existing event listeners
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);

        // Forcefully close the WebSocket connection and nullify it
        if (websocket) {
            if (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING) {
                websocket.close(1000, "Game reset and connection terminated");
                console.log("WebSocket closed with code 1000");
            } else if (websocket.readyState === WebSocket.CLOSING) {
                // Wait for closing to complete, then nullify
                const checkCloseInterval = setInterval(() => {
                    if (websocket.readyState === WebSocket.CLOSED) {
                        clearInterval(checkCloseInterval);
                        websocket = null;
                        console.log("WebSocket fully closed and nullified");
                    }
                }, 100); // Check every 100ms
            } else {
                websocket = null;
                console.log("WebSocket already closed or in invalid state, set to null");
            }
        }

        // Clear the canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        offScreenCtx.clearRect(0, 0, offScreenCanvas.width, offScreenCanvas.height);

        // Reset DOM visibility
        preGame.style.display = "flex";
        canvas.style.display = "none";
        postGame.style.display = "none";
    }

    function cleanup(winner = null) {
        // Remove event listeners to prevent further input
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
        keyState = {};

        // Close the WebSocket connection
        if (websocket) {
            if (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING) {
                websocket.close(1000, "Game ended");
                console.log("WebSocket closed with code 1000 during cleanup");
            }
            // Nullify immediately after attempting to close
            websocket = null;
        }

        // Update post-game section
        myUsername.textContent = player;
        myScore.textContent = score_1;
        const isPlayer1 = player === "1";
        opponentUsername.textContent = isPlayer1 ? "Opponent" : "Player 1";
        opponentScore.textContent = isPlayer1 ? score_2 : score_1;

        // Update win/lose message
        const postGameMessage = document.querySelector(".Post-Game h2");
        if (winner === player) {
            postGameMessage.textContent = "You have Won!";
        } else {
            postGameMessage.textContent = "You have Lost!";
        }

        // Show post-game section, hide others
        preGame.style.display = "none";
        canvas.style.display = "none";
        postGame.style.display = "flex";

        // Add play again functionality
        playAgain.addEventListener("click", () => {
            create_game('')
                .then(response => {
                    console.log("Response received:", response);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.json().then(data => {
                        console.log("Parsed JSON:", data);
                        return { ok: response.ok, data };
                    });
                })
                .then(({ ok, data }) => {
                    if (ok && data.game_id) {
                        gameId = data.game_id;
                        // Reset the game state and start a new session
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
        }, { once: true }); // Ensure the listener is only added once
    }

    function connectWebSocket() {
        // Ensure no existing WebSocket instance before creating a new one
        if (websocket) {
            console.warn("Existing WebSocket detected, forcing closure");
            if (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING) {
                websocket.close(1000, "Forcing closure for new connection");
            }
            websocket = null;
        }

        websocket = new WebSocket(`wss://localhost:8000/ws/pong/${gameId}/`);

        websocket.onopen = function (event) {
            console.log('WebSocket opened for player:', player);
            if (player) {
                const connectMessage = JSON.stringify({
                    'action': 'connect',
                    'player_id': player
                });
                console.log("Sending connect message:", connectMessage);
                websocket.send(connectMessage);
                // Attach key listeners only after WebSocket is open
                attachKeyListeners();
            } else {
                console.error("Player ID is undefined, cannot send connect message");
            }
        };

        websocket.onmessage = function (event) {
            let game_state = JSON.parse(event.data);
            if (game_state.error) {
                console.error("Server error:", game_state.error);
                return;
            }

            // Check for game mode message
            if (game_state.game_opponent) {
                gameMode = game_state.game_opponent;
                console.log("Game mode set to:", gameMode);
            }

            if (!initialStateReceived) {
                paddle1_x = game_state.paddle1_x;
                paddle2_x = game_state.paddle2_x;
                ball_bounds = game_state.ball_bounds;
                paddle_bounds_x = game_state.paddle_bounds_x;
                paddle_bounds_y = game_state.paddle_bounds_y;
                initialStateReceived = true;
                preGame.style.display = "none";
                canvas.style.display = "flex";
            }

            if (game_state.score1 > score_1) {
                score_1 = game_state.score1;
                if (score_1 === 7) {
                    const winner = "1";
                    cleanup(winner === player ? player : opponentUsername.textContent);
                }
            }
            if (game_state.score2 > score_2) {
                score_2 = game_state.score2;
                if (score_2 === 7) {
                    const winner = "2";
                    cleanup(winner === player ? player : opponentUsername.textContent);
                }
            }

            updateAndDrawGame({
                'ball_x': game_state.ball_x,
                'ball_y': game_state.ball_y,
                'paddle1_y': game_state.paddle1_y,
                'paddle2_y': game_state.paddle2_y,
                'score1': game_state.score1,
                'score2': game_state.score2,
                'paddle1_x': game_state.paddle1_x,
                'paddle2_x': game_state.paddle2_x,
                'ball_bounds': game_state.ball_bounds,
                'paddle_bounds_x': game_state.paddle_bounds_x,
                'paddle_bounds_y': game_state.paddle_bounds_y,
            });
        };

        websocket.onerror = function (event) {
            console.error('WebSocket error:', event);
            cleanup();
            window.location.hash = '#play';
        };

        websocket.onclose = function (event) {
            console.log('WebSocket closed:', event);
            if (event.code === 4000 || event.code === 4001) {
                console.error("Connection closed due to server error:", event.reason);
            }
            // WebSocket is already nullified in cleanup or resetGame
        };
    }

    // Add 3-second delay before connecting to WebSocket
    setTimeout(() => {
        connectWebSocket();
        // Set a timeout to redirect to #play if connection takes too long
        setTimeout(() => {
            if (!initialStateReceived && websocket && websocket.readyState !== WebSocket.OPEN) {
                console.warn("WebSocket connection timed out, redirecting to #play");
                window.location.hash = '#play';
                cleanup();
            }
        }, 15000); // 15-second timeout
    }, 3000);
}