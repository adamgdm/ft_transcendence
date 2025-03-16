import { initializeCanvas, updateAndDrawGame } from './gamec.js';
// there is a variable called game_id in the global scope of pon/pong.js

let game_id = 3;
let paddle1_x;
let paddle2_x;
let ball_bounds;
let paddle_bounds_x;
let paddle_bounds_y;
let score_1 = 0;
let score_2 = 0;
let initialStateReceived = false;

console.log('pongc = ', game_id);

// sleep for 1 second to allow the server to start
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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

let player2 = 'player2';

sleep(1000);

let websocket = new WebSocket(`wss://localhost:8000/ws/pong/${game_id}/${player2}/`);

websocket.onopen = function (event) {
    console.log('websocket opened');
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
// this is done to reduce the number of messages sent to the server
let keyState = {};

document.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowUp' && !keyState['ArrowUp']) {
        keyState['ArrowUp'] = true;
        websocket.send(JSON.stringify({
            'action': 'upStart',
            'player_id': player2
        }));
    } else if (event.key === 'ArrowDown' && !keyState['ArrowDown']) {
        keyState['ArrowDown'] = true;
        websocket.send(JSON.stringify({
            'action': 'downStart',
            'player_id': player2
        }));
    }
});

document.addEventListener('keyup', function (event) {
    if (event.key === 'ArrowUp' && keyState['ArrowUp']) {
        keyState['ArrowUp'] = false;
        websocket.send(JSON.stringify({
            'action': 'upStop',
            'player_id': player2
        }));
    } else if (event.key === 'ArrowDown' && keyState['ArrowDown']) {
        keyState['ArrowDown'] = false;
        websocket.send(JSON.stringify({
            'action': 'downStop',
            'player_id': player2
        }));
    }
});

websocket.onclose = function (event) {
    console.log('websocket closed');
    // print the reason why

};

websocket.onerror = function (event) {
    console.log('websocket error');
    // print the msg that caused the error
    console.log(event);
};

export { paddle1_x, paddle2_x, ball_bounds, paddle_bounds_x, paddle_bounds_y, score_1, score_2 };