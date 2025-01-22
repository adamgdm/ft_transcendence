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

const token = 'jwt_token_for_testing_purposes';

function create_game(my_username, opponent_username, game_opponent) {
    let body;
    if (opponent_username === '') {
        opponent_username = null;
        body = `player_1=${encodeURIComponent(my_username)}&game_opponent=${encodeURIComponent(game_opponent)}`;
    } else if (game_opponent === '') {
        game_opponent = null;
        body = `player_1=${encodeURIComponent(my_username)}&player_2=${encodeURIComponent(opponent_username)}`;
    }

    return fetch('http://localhost:8000/create_game/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Bearer ${token}`
        },
        body: body
    });
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

let player1 = 'player1';
let player2 = '';
let game_opponent = 'ai';

create_game(player1, player2, game_opponent)
    .then(response => response.json())
    .then(data => {
        game_id = data.game_id;
        if (game_opponent === 'ai') {
            player2 = 'ai';
        }
        let websocket = new WebSocket(`ws://localhost:8000/ws/pong/${game_id}/${player1}/${player2}/`);
        
        websocket.onopen = function (event) {
            console.log('websocket opened');
        };

        websocket.onmessage = function (event) {
            console.log('message received');
            console.log(event.data);
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
            }
            if (game_state.score2 > score_2) {
                score_2 = game_state.score2;
            }


            update_game_state(game_state);
        };

        document.addEventListener('keydown', function (event) {
            if (event.key === 'ArrowUp') {
                websocket.send(JSON.stringify({
                    'action': 'up',
                    'player_id': player1
                }));
            } else if (event.key === 'ArrowDown') {
                websocket.send(JSON.stringify({
                    'action': 'down',
                    'player_id': player1
                }));
            }
        });

        websocket.onclose = function (event) {
            console.log('websocket closed');
        };

        websocket.onerror = function (event) {
            console.log('websocket error');
        };
    });

export { paddle1_x, paddle2_x, ball_bounds, paddle_bounds_x, paddle_bounds_y, score_1, score_2 };