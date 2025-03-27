import json
import asyncio
from datetime import datetime, timedelta
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from authentication.utils import decode_jwt_token
from authentication.models import BlacklistedTokens, LoggedOutTokens, Users
from django.db.models import Q
from .models import Tournament, Match
import logging
import time

logger = logging.getLogger(__name__)

game_locks = {}

class PongConsumer(AsyncWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.game_locks = game_locks

    @database_sync_to_async
    def check_ws_auth(self, scope):
        token = scope["cookies"].get("token")
        if not token:
            return None, "Token is missing"

        try:
            payload = decode_jwt_token(token)
            if payload is None:
                return None, "Token is invalid"

            exp = datetime.utcfromtimestamp(payload["exp"])
            if exp <= datetime.utcnow():
                return None, "Token has expired"

            if BlacklistedTokens.objects.filter(token=token).exists():
                return None, "Token is blacklisted"

            if LoggedOutTokens.objects.filter(token=token).exists():
                return None, "Token is invalid"

            user = Users.objects.get(id=payload["user_id"])
            user.online_status = datetime.utcnow() + timedelta(minutes=2)
            user.save()
            return user.user_name, "Success"
        except Users.DoesNotExist:
            return None, "User not found"
        except Exception as e:
            logger.error(f"Authentication error: {e}")
            return None, "Authentication failed"

    async def connect(self):
        try:
            from .views import games
        except ImportError as e:
            logger.error(f"Cannot import views: {e}")
            await self.send(text_data=json.dumps({'error': 'Internal server error'}))
            await self.close(code=4001, reason="Server misconfiguration")
            return

        self.game_id = self.scope['url_route']['kwargs']['game_id']
        self.room_group_name = f'pong_{self.game_id}'
        self.game_task = None

        self.client_id, result = await self.check_ws_auth(self.scope)
        if not self.client_id:
            logger.info(f"Auth failed for game {self.game_id}: {result}")
            await self.close(code=4001, reason=result)
            return

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

        game = await self.wait_for_game(games)
        if not game:
            return

        if self.client_id not in [game['player_1'], game['player_2']]:
            logger.warning(f"Client {self.client_id} not in game {self.game_id}. Expected: {game['player_1']} or {game['player_2']}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'error': 'You are not a player in this game'
            }))
            await self.close(code=4002, reason="Unauthorized player")
            return

        lock = self.game_locks.setdefault(self.game_id, asyncio.Lock())
        async with lock:
            if self.client_id == game['player_1']:
                game['player1_status'] = 'online'
                game['player1_disconnect_time'] = None
            elif self.client_id == game['player_2']:
                game['player2_status'] = 'online'
                game['player2_disconnect_time'] = None

        await self.send_initial_state(game)

        async with lock:
            if (game['player1_status'] == 'online' and 
                game['player2_status'] == 'online' and 
                not game.get('game_running', False)):
                game['game_running'] = True
                logger.info(f"Starting game {self.game_id}: {game['player_1']} vs {game['player_2']}")
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'game_start',
                        'message': 'Game starting now...',
                        'game_id': self.game_id
                    }
                )
                self.game_task = asyncio.create_task(self.game_update_loop())
            elif game['player1_status'] != 'online' or game['player2_status'] != 'online':
                await self.send(text_data=json.dumps({
                    'type': 'status',
                    'message': 'Waiting for the other player to connect...'
                }))
                asyncio.create_task(self.wait_for_both_players(games))

    async def wait_for_both_players(self, games):
        timeout = 60
        elapsed = 0
        while elapsed < timeout:
            lock = self.game_locks.setdefault(self.game_id, asyncio.Lock())
            async with lock:
                game = games.get(self.game_id)
                if not game:
                    logger.warning(f"Game {self.game_id} no longer exists in wait_for_both_players")
                    break
                if (game['player1_status'] == 'online' and 
                    game['player2_status'] == 'online' and 
                    not game.get('game_running', False)):
                    game['game_running'] = True
                    logger.info(f"Starting game {self.game_id}: {game['player_1']} vs {game['player_2']}")
                    await self.channel_layer.group_send(
                        self.room_group_name,
                        {
                            'type': 'game_start',
                            'message': 'Game starting now...',
                            'game_id': self.game_id
                        }
                    )
                    self.game_task = asyncio.create_task(self.game_update_loop())
                    break
            await asyncio.sleep(1)
            elapsed += 1
        if elapsed >= timeout:
            logger.warning(f"Timeout: Game {self.game_id} did not start after {timeout}s")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'error': 'Game failed to start: opponent did not connect in time'
            }))
            await self.close(code=4000, reason="Game start timeout")

    async def wait_for_game(self, games):
        timeout = 30
        elapsed = 0
        while elapsed < timeout:
            if self.game_id in games:
                game = games[self.game_id]
                logger.debug(f"Game {self.game_id} found: {game}")
                return game
            await self.send(text_data=json.dumps({
                'type': 'status',
                'message': 'Waiting for game to start...'
            }))
            await asyncio.sleep(2)
            elapsed += 2
        logger.warning(f"Timeout: Game {self.game_id} not initialized after {timeout}s")
        await self.send(text_data=json.dumps({
            'type': 'error',
            'error': 'Game not found or not yet started'
        }))
        await self.close(code=4000, reason="Game not ready")
        return None

    async def disconnect(self, close_code):
        try:
            from .views import games
        except ImportError as e:
            logger.error(f"Cannot import views on disconnect: {e}")
            return

        if self.game_task:
            self.game_task.cancel()
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

        lock = self.game_locks.setdefault(self.game_id, asyncio.Lock())
        async with lock:
            game = games.get(self.game_id)
            if game and self.client_id:
                if self.client_id == game['player_1']:
                    game['player1_status'] = 'offline'
                    game['player1_disconnect_time'] = datetime.utcnow()
                elif self.client_id == game['player_2']:
                    game['player2_status'] = 'offline'
                    game['player2_disconnect_time'] = datetime.utcnow()
                logger.info(f"Player {self.client_id} disconnected from game {self.game_id}")

    async def receive(self, text_data):
        try:
            from .views import games
        except ImportError as e:
            logger.error(f"Cannot import views in receive: {e}")
            await self.send(text_data=json.dumps({'type': 'error', 'error': 'Internal server error'}))
            return

        try:
            data = json.loads(text_data)
            action = data['action']
            paddle = data.get('paddle')  # Only used in local mode
            logger.debug(f"Received: {data}, using client_id: {self.client_id}")
        except (json.JSONDecodeError, KeyError) as e:
            logger.error(f"Invalid message: {e}")
            return
        
        lock = self.game_locks.setdefault(self.game_id, asyncio.Lock())
        async with lock:
            game = games.get(self.game_id)
            if not game:
                logger.warning(f"Game {self.game_id} not found in receive")
                return

            valid_actions = ['upStart', 'upStop', 'downStart', 'downStop']
            if game['game_opponent'] == 'local':
                valid_actions.extend(['wStart', 'wStop', 'sStart', 'sStop'])

            if action not in valid_actions:
                logger.debug(f"Invalid action: {action}")
                return

            if game.get('status') == 'done':
                await self.send(text_data=json.dumps({'status': 'done'}))
                return

            if game['game_opponent'] == 'local':
                if self.client_id != game['player_1']:
                    logger.debug(f"Invalid client_id {self.client_id} for local game")
                    return
                target_paddle = paddle
                if not target_paddle or target_paddle not in ['player1', 'player2']:
                    logger.debug(f"Invalid paddle: {paddle}")
                    return
                self.update_paddle(game, target_paddle, action)
            else:
                if self.client_id == game['player_1']:
                    self.update_paddle(game, 'player1', action)
                elif self.client_id == game['player_2']:
                    self.update_paddle(game, 'player2', action)

    def update_paddle(self, game, paddle, action):
        if action in ['wStart', 'upStart']:
            game[f'{paddle}_moving'] = 'up'
        elif action in ['wStop', 'upStop']:
            if game.get(f'{paddle}_moving') == 'up':
                game[f'{paddle}_moving'] = None
        elif action in ['sStart', 'downStart']:
            game[f'{paddle}_moving'] = 'down'
        elif action in ['sStop', 'downStop']:
            if game.get(f'{paddle}_moving') == 'down':
                game[f'{paddle}_moving'] = None

    async def game_update_loop(self):
        try:
            from .views import games, game_update
        except ImportError as e:
            logger.error(f"Cannot import views in game_update_loop: {e}")
            return

        frame_rate = 60
        frame_duration = 1 / frame_rate
        last_frame_time = time.time()

        lock = self.game_locks.setdefault(self.game_id, asyncio.Lock())
        while True:
            current_time = time.time()
            elapsed = current_time - last_frame_time
            if elapsed < frame_duration:
                await asyncio.sleep(frame_duration - elapsed)
                current_time = time.time()

            async with lock:
                game = games.get(self.game_id)
                if not game:
                    logger.warning(f"Game {self.game_id} not found in update loop")
                    break

                now = datetime.utcnow()
                for player, status_key, disconnect_key, opponent_score_key in [
                    ('player1', 'player1_status', 'player1_disconnect_time', 'score2'),
                    ('player2', 'player2_status', 'player2_disconnect_time', 'score1')
                ]:
                    if game[status_key] == 'offline' and game[disconnect_key]:
                        if (now - game[disconnect_key]).total_seconds() > 7:
                            game[opponent_score_key] = 7
                            game['status'] = 'done'
                            game['winner'] = game['player_2'] if player == 'player1' else game['player_1']
                            await self.send_final_state(game)
                            await self.end_game(game)
                            await self.close(code=1000, reason="Game ended due to disconnect")
                            return

                for player in ['player1', 'player2']:
                    paddle = 'paddle1_y' if player == 'player1' else 'paddle2_y'
                    if game.get(f'{player}_moving') == 'up':
                        game[paddle] = max(0 + game['paddle_bounds_y'], game[paddle] - game['paddle_speed'])
                    elif game.get(f'{player}_moving') == 'down':
                        game[paddle] = min(1 - game['paddle_bounds_y'], game[paddle] + game['paddle_speed'])

                updated_game = await game_update(self.game_id)
                if not updated_game:
                    logger.error(f"Game update failed for {self.game_id}")
                    break
                game.update(updated_game)

                if game.get('status') == 'done':
                    await self.send_final_state(game)
                    await self.end_game(game)
                    await self.close(code=1000, reason="Game ended")
                    break

                await self.channel_layer.group_send(
                    self.room_group_name,
                    {'type': 'game_state', 'game_state': game}
                )
            last_frame_time = current_time

    async def send_initial_state(self, game):
        await self.send(text_data=json.dumps({
            'type': 'initial_state',
            'paddle1_x': game['paddle1_x'],
            'paddle2_x': game['paddle2_x'],
            'paddle1_y': game['paddle1_y'],
            'paddle2_y': game['paddle2_y'],
            'ball_x': game['ball_x'],
            'ball_y': game['ball_y'],
            'score1': game['score1'],
            'score2': game['score2'],
            'ball_bounds': game['ball_bounds'],
            'paddle_bounds_x': game['paddle_bounds_x'],
            'paddle_bounds_y': game['paddle_bounds_y'],
            'game_opponent': game['game_opponent'],
            'player_1': game['player_1'],
            'player_2': game['player_2']
        }))

    async def send_final_state(self, game):
        final_state = {
            'type': 'game_state',
            'ball_x': game['ball_x'],
            'ball_y': game['ball_y'],
            'paddle1_y': game['paddle1_y'],
            'paddle2_y': game['paddle2_y'],
            'score1': game['score1'],
            'score2': game['score2'],
            'paddle1_x': game['paddle1_x'],
            'paddle2_x': game['paddle2_x'],
            'ball_bounds': game['ball_bounds'],
            'paddle_bounds_x': game['paddle_bounds_x'],
            'paddle_bounds_y': game['paddle_bounds_y'],
            'game_opponent': game['game_opponent'],
            'status': game.get('status', 'done'),
            'player_1': game['player_1'],
            'player_2': game['player_2'],
            'winner': game.get('winner', 'Unknown')
        }
        await self.channel_layer.group_send(
            self.room_group_name,
            {'type': 'game_state', 'game_state': final_state}
        )

    async def end_game(self, game):
        try:
            from .views import games
        except ImportError:
            return
        lock = self.game_locks.setdefault(self.game_id, asyncio.Lock())
        async with lock:
            if self.game_id in games:
                del games[self.game_id]
                if self.game_id in self.game_locks:
                    del self.game_locks[self.game_id]

    async def game_state(self, event):
        game = event['game_state']
        state = {
            'type': 'game_state',
            'ball_x': game['ball_x'],
            'ball_y': game['ball_y'],
            'paddle1_y': game['paddle1_y'],
            'paddle2_y': game['paddle2_y'],
            'score1': game['score1'],
            'score2': game['score2'],
            'paddle1_x': game['paddle1_x'],
            'paddle2_x': game['paddle2_x'],
            'ball_bounds': game['ball_bounds'],
            'paddle_bounds_x': game['paddle_bounds_x'],
            'paddle_bounds_y': game['paddle_bounds_y'],
            'game_opponent': game['game_opponent'],
            'status': game.get('status', 'active'),
            'player_1': game['player_1'],
            'player_2': game['player_2']
        }
        if 'winner' in game:
            state['winner'] = game['winner']
        await self.send(text_data=json.dumps(state))

    async def game_start(self, event):
        await self.send(text_data=json.dumps({
            'type': 'game_start',
            'message': event['message'],
            'game_id': event['game_id']
        }))