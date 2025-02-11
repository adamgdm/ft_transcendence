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

    // Draw left paddle as a spaceship
    ctx.beginPath();
    // Main body of the spaceship
    ctx.moveTo(left_x * width - paddleWidth / 2, left_y * height - paddleHeight / 2); // Top left corner
    ctx.lineTo(left_x * width + paddleWidth / 2, left_y * height - paddleHeight / 2); // Top right corner
    ctx.lineTo(left_x * width + paddleWidth / 2, left_y * height + paddleHeight / 2); // Bottom right corner
    ctx.lineTo(left_x * width - paddleWidth / 2, left_y * height + paddleHeight / 2); // Bottom left corner
    ctx.closePath();
    ctx.fill();

    // Left spaceship details
    // Cockpit
    ctx.beginPath();
    ctx.arc(left_x * width, left_y * height - paddleHeight / 4, paddleWidth / 4, 0, Math.PI * 2);
    ctx.fillStyle = "black";
    ctx.fill();

    // Left wing
    ctx.beginPath();
    ctx.moveTo(left_x * width - paddleWidth / 2, left_y * height + paddleHeight / 4);
    ctx.lineTo(left_x * width - paddleWidth / 2 - 10, left_y * height + paddleHeight / 2);
    ctx.lineTo(left_x * width - paddleWidth / 2, left_y * height + paddleHeight / 2);
    ctx.closePath();
    ctx.fillStyle = "white";
    ctx.fill();

    // Right wing
    ctx.beginPath();
    ctx.moveTo(left_x * width - paddleWidth / 2, left_y * height - paddleHeight / 4);
    ctx.lineTo(left_x * width - paddleWidth / 2 - 10, left_y * height - paddleHeight / 2);
    ctx.lineTo(left_x * width - paddleWidth / 2, left_y * height - paddleHeight / 2);
    ctx.closePath();
    ctx.fillStyle = "white";
    ctx.fill();

    // Draw right paddle as a spaceship
    ctx.beginPath();
    // Main body of the spaceship
    ctx.moveTo(right_x * width - paddleWidth / 2, right_y * height - paddleHeight / 2); // Top left corner
    ctx.lineTo(right_x * width + paddleWidth / 2, right_y * height - paddleHeight / 2); // Top right corner
    ctx.lineTo(right_x * width + paddleWidth / 2, right_y * height + paddleHeight / 2); // Bottom right corner
    ctx.lineTo(right_x * width - paddleWidth / 2, right_y * height + paddleHeight / 2); // Bottom left corner
    ctx.closePath();
    ctx.fill();

    // Right spaceship details
    // Cockpit
    ctx.beginPath();
    ctx.arc(right_x * width, right_y * height - paddleHeight / 4, paddleWidth / 4, 0, Math.PI * 2);
    ctx.fillStyle = "black";
    ctx.fill();

    // Left wing
    ctx.beginPath();
    ctx.moveTo(right_x * width + paddleWidth / 2, right_y * height + paddleHeight / 4);
    ctx.lineTo(right_x * width + paddleWidth / 2 + 10, right_y * height + paddleHeight / 2);
    ctx.lineTo(right_x * width + paddleWidth / 2, right_y * height + paddleHeight / 2);
    ctx.closePath();
    ctx.fillStyle = "white";
    ctx.fill();

    // Right wing
    ctx.beginPath();
    ctx.moveTo(right_x * width + paddleWidth / 2, right_y * height - paddleHeight / 4);
    ctx.lineTo(right_x * width + paddleWidth / 2 + 10, right_y * height - paddleHeight / 2);
    ctx.lineTo(right_x * width + paddleWidth / 2, right_y * height - paddleHeight / 2);
    ctx.closePath();
    ctx.fillStyle = "white";
    ctx.fill();
}

function drawBall(ctx, width, height, ball_x, ball_y, radius, pastPositions) {
    // Draw a trail of the ball that gets lighter, smaller, and changes color as it goes back
    for (let i = pastPositions.length - 1; i >= 0; i--) {
        ctx.beginPath();
        const trailRadius = radius * width * (0.5 + 0.5 * i / pastPositions.length); // Smaller as it goes back
        const alpha = i / pastPositions.length; // Lighter as it goes back
        const color = `rgba(${255 - 200 * alpha}, ${100 - 100 * alpha}, 0, ${alpha})`; // Flame color

        ctx.arc(pastPositions[i].x * width, pastPositions[i].y * height, trailRadius, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
    }

    // Draw the current position of the ball with a random jagged appearance
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * 2 * Math.PI;
        const randomFactor = 0.7 + Math.random() * 0.3; // Randomize the shape a bit
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

    ctx.drawImage(offScreenCanvas, 0, 0);
    drawPaddles(ctx, width, height, paddle1_x, game.paddle1_y, paddle2_x, game.paddle2_y, paddle_bounds_x, paddle_bounds_y);
    drawBall(ctx, width, height, game.ball_x, game.ball_y, ball_bounds, pastPositions);
    drawScore(ctx, width, height, score_1, score_2);
}

const { canvas, ctx, offScreenCanvas, offScreenCtx } = initializeCanvas();

let pastPositions = [];

function updateAndDrawGame(game) {
    pastPositions.push({x: game.ball_x, y: game.ball_y});

    if (pastPositions.length > 20) {
        pastPositions.shift();
    }
    drawGame(game, ctx, canvas, offScreenCanvas);
}

export { updateAndDrawGame, initializeCanvas };