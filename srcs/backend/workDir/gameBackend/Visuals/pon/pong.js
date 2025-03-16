import { initializeCanvas, updateAndDrawGame } from './game.js';

let game_id;
let paddle1_x;
let paddle2_x;
let ball_bounds;
let paddle_bounds_x;
let paddle_bounds_y;
let score_1 = 0;
let score_2 = 0;
let initialStateReceived = false;

let username = 'player1';
let password = 'Password123';

async function login(username, password) {
    let body = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

    try {  // Add try-catch for better error handling
        const response = await fetch('https://localhost:8000/login/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            credentials: 'include',  // Add this for cookies
            body: body
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Login failed');
        }
        return 'Login successful';
    } catch (error) {
        console.error('Login error:', error.message);
        throw error;
    }
}

login(username, password);

async function create_game(my_username, opponent_username, game_opponent) {
    let body = `player_1=${encodeURIComponent(my_username)}&player_2=${encodeURIComponent(opponent_username)}&game_opponent=${encodeURIComponent(game_opponent)}`;

    try {  // Add try-catch
        const response = await fetch('https://localhost:8000/create_game/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            credentials: 'include',  // Add this for cookies
            body: body
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Game creation failed');
        }

        const data = await response.json();
        game_id = data.game_id;
        return game_id;
    } catch (error) {
        console.error('Create game error:', error.message);
        throw error;
    }
}

function update_game_state(data) {
    updateAndDrawGame({
        'ball_x': data.ball_x,
        'ball_y': data.ball_y,
        'paddle1_y': data.paddle1_y,
        'paddle2_y': data.paddle2_y,
        'score1': data.score1,
        'score2': data.score2,
        'paddle1_x': data.paddle1_x,
        'paddle2_x': data.paddle2_x,
        'ball_bounds': data.ball_bounds,
        'paddle_bounds_x': data.paddle_bounds_x,
        'paddle_bounds_y': data.paddle_bounds_y,
    });
}

function initializeWebSocket(player, game_id) {
    console.log('pong = ', game_id);
    let websocket = new WebSocket(`wss://localhost:8000/ws/pong/${game_id}/${player}/`);

    websocket.onopen = function (event) {
        console.log('websocket opened for ' + player);
        websocket.send(JSON.stringify({
            'action': 'connect',
            'player_id': player
        }));
    };

    websocket.onmessage = function (event) {
        let game_state = JSON.parse(event.data);

        if (!initialStateReceived) {
            paddle1_x = game_state.paddle1_x;
            paddle2_x = game_state.paddle2_x;
            ball_bounds = game_state.ball_bounds;
            paddle_bounds_x = game_state.paddle_bounds_x;
            paddle_bounds_y = game_state.paddle_bounds_y;
            initialStateReceived = true;
        }

        if (game_state.score1 > score_1) {
            score_1 = game_state.score1;
            if (score_1 === 7) {
                console.log('Player 1 wins');
                websocket.close();
            }
        }
        if (game_state.score2 > score_2) {
            score_2 = game_state.score2;
            if (score_2 === 7) {
                console.log('Player 2 wins');
                websocket.close();
            }
        }

        update_game_state(game_state);
    };

    // Sending upStart and downStart events on keydown and upStop and downStop events on keyup
    let keyState = {};

    document.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowUp' && !keyState['ArrowUp']) {
            keyState['ArrowUp'] = true;
            websocket.send(JSON.stringify({
                'action': 'upStart',
                'player_id': player
            }));
        } else if (event.key === 'ArrowDown' && !keyState['ArrowDown']) {
            keyState['ArrowDown'] = true;
            websocket.send(JSON.stringify({
                'action': 'downStart',
                'player_id': player
            }));
        }
    });

    document.addEventListener('keyup', function (event) {
        if (event.key === 'ArrowUp' && keyState['ArrowUp']) {
            keyState['ArrowUp'] = false;
            websocket.send(JSON.stringify({
                'action': 'upStop',
                'player_id': player
            }));
        } else if (event.key === 'ArrowDown' && keyState['ArrowDown']) {
            keyState['ArrowDown'] = false;
            websocket.send(JSON.stringify({
                'action': 'downStop',
                'player_id': player
            }));
        }
    });

    websocket.onclose = function (event) {
        console.log('websocket closed for ' + player);
    };

    websocket.onerror = function (event) {
        console.log('websocket error for ' + player);
    };
}

let player1 = 'player1';
let player2 = 'player1';
let game_opponent = 'local';

async function start_game() {
    game_id = await create_game(player1, player2, game_opponent);
    return game_id;
}

game_id = await start_game();
initializeWebSocket(player1, game_id);

function get_game_id() {
    return game_id;
}

export { paddle1_x, paddle2_x, ball_bounds, paddle_bounds_x, paddle_bounds_y, score_1, score_2, get_game_id };