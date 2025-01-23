import { paddle1_x, paddle2_x, ball_bounds, paddle_bounds_x, paddle_bounds_y, score_1, score_2 } from './pong.js';

// Code optimized by using const, let and by reducing the number of redundant operations

function initializeCanvas() {
    const canvas = document.getElementById("pong");
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
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawPaddles(ctx, width, height, left_x, left_y, right_x, right_y, bounds_x, bounds_y) {
    ctx.fillStyle = "white";
    const paddleWidth = bounds_x * width;
    const paddleHeight = bounds_y * height * 2;
    ctx.fillRect(left_x * width - paddleWidth / 2, left_y * height - paddleHeight / 2, paddleWidth, paddleHeight);
    ctx.fillRect(right_x * width - paddleWidth / 2, right_y * height - paddleHeight / 2, paddleWidth, paddleHeight);
}

function drawBall(ctx, width, height, ball_x, ball_y, radius) {
    ctx.beginPath();
    ctx.arc(ball_x * width, ball_y * height, radius * width, 0, 2 * Math.PI);
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

    ctx.drawImage(offScreenCanvas, 0, 0);
    drawPaddles(ctx, width, height, paddle1_x, game.paddle1_y, paddle2_x, game.paddle2_y, paddle_bounds_x, paddle_bounds_y);
    drawBall(ctx, width, height, game.ball_x, game.ball_y, ball_bounds);
    drawScore(ctx, width, height, score_1, score_2);
}

const { canvas, ctx, offScreenCanvas, offScreenCtx } = initializeCanvas();

function updateAndDrawGame(game) {
    drawGame(game, ctx, canvas, offScreenCanvas);
}

export { updateAndDrawGame, initializeCanvas };