import { paddle1_x, paddle2_x, ball_bounds, paddle_bounds_x, paddle_bounds_y, score_1, score_2 } from './pong.js';

function initializeCanvas() {
    var canvas = document.getElementById("pong");
    var ctx = canvas.getContext("2d");

    var offScreenCanvas = document.createElement("canvas");
    offScreenCanvas.width = canvas.width;
    offScreenCanvas.height = canvas.height;
    var offScreenCtx = offScreenCanvas.getContext("2d");

    colorBackground(offScreenCtx, offScreenCanvas);
    drawScore(offScreenCtx, offScreenCanvas, 0, 0);
    
    return { canvas, ctx, offScreenCanvas, offScreenCtx };
}

function colorBackground(ctx, canvas) {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawPaddles(ctx, canvas, left_x, left_y, right_x, right_y, bounds_x, bounds_y) {
    ctx.fillStyle = "white";
    ctx.fillRect(left_x * canvas.width - bounds_x * canvas.width / 2, left_y * canvas.height - bounds_y * canvas.height, bounds_x * canvas.width, bounds_y * canvas.height * 2);
    ctx.fillRect(right_x * canvas.width - bounds_x * canvas.width / 2, right_y * canvas.height - bounds_y * canvas.height, bounds_x * canvas.width, bounds_y * canvas.height * 2);
}

function drawBall(ctx, canvas, ball_x, ball_y, radius) {
    ctx.beginPath();
    ctx.arc(ball_x * canvas.width, ball_y * canvas.height, radius * canvas.width, 0, 2 * Math.PI);
    ctx.fillStyle = "white";
    ctx.fill();
}

function drawScore(ctx, canvas, score1, score2) {
    ctx.font = "30px Arial";
    ctx.fillStyle = "white";
    ctx.fillText(score1, canvas.width / 4, 50);
    ctx.fillText(score2, canvas.width * 3 / 4, 50);
}

function drawGame(game, ctx, canvas, offScreenCanvas) {
    ctx.drawImage(offScreenCanvas, 0, 0);

    drawPaddles(ctx, canvas, paddle1_x, game.paddle1_y, paddle2_x, game.paddle2_y, paddle_bounds_x, paddle_bounds_y);
    drawBall(ctx, canvas, game.ball_x, game.ball_y, ball_bounds);
    drawScore(ctx, canvas, score_1, score_2);
}

var { canvas, ctx, offScreenCanvas, offScreenCtx } = initializeCanvas();

function updateAndDrawGame(game) {
    drawGame(game, ctx, canvas, offScreenCanvas);
}

export { updateAndDrawGame, initializeCanvas };