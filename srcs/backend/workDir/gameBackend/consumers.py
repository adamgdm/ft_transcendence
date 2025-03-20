import json
import asyncio
from datetime import datetime, timedelta
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from authentication.utils import decode_jwt_token
from authentication.models import BlacklistedTokens, LoggedOutTokens, Users
import logging
import time

logger = logging.getLogger(__name__)

games_lock = asyncio.Lock()

class PongConsumer(AsyncWebsocketConsumer):
    @database_sync_to_async
    def check_wsAuth(self, scope):
        token = scope["cookies"].get("token")
        if not token:
            return None, "Token is missing"

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

        try:
            user = Users.objects.get(id=payload["user_id"])
            user.online_status = datetime.utcnow() + timedelta(minutes=2)
            user.save()
            return user.user_name, "Success"
        except Users.DoesNotExist:
            return None, "User not found"
        except Exception as e:
            logger.error(f"Error during authentication: {e}")
            return None, "Authentication failed"

    async def connect(self):
        try:
            from .views import games
        except ImportError as e:
            logger.error(f"Error importing views: {e}")
            await self.send(text_data=json.dumps({'error': 'Internal server error'}))
            await self.close(code=4001, reason="Server misconfiguration")
            return

        self.game_id = self.scope['url_route']['kwargs']['game_id']
        self.room_group_name = f'pong_{self.game_id}'
        self.game_task = None  # Track the game loop task
        
        self.client_id, result = await self.check_wsAuth(self.scope)
        if self.client_id is None:
            logger.info(f"Authentication failed for game {self.game_id}: {result}")
            await self.close(code=4001, reason=result)
            return

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

        timeout = 30
        elapsed = 0
        game = None
        while elapsed < timeout:
            async with games_lock:
                if self.game_id in games:
                    game = games[self.game_id]
                    logger.debug(f"Game {self.game_id} found: {game}")
                    break
            await self.send(text_data=json.dumps({
                'type': 'status',
                'message': 'Waiting for game to start...'
            }))
            await asyncio.sleep(2)
            elapsed += 2

        if not game:
            logger.warning(f"Timeout: Game {self.game_id} not initialized after {timeout}s")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'error': 'Game not found or not yet started'
            }))
            await self.close(code=4000, reason="Game not ready")
            return

        if self.client_id not in [game['player_1'], game['player_2']]:
            logger.warning(f"Client {self.client_id} not in game {self.game_id}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'error': 'You are not a player in this game'
            }))
            await self.close(code=4002, reason="Unauthorized player")
            return

        async with games_lock:
            if self.client_id == game['player_1']:
                game['player1_status'] = 'online'
                game['player1_disconnect_time'] = None
            elif self.client_id == game['player_2']:
                game['player2_status'] = 'online'
                game['player2_disconnect_time'] = None

        await self.send_initial_state(game)

        # Start game if both players are online, regardless of who connects last
        async with games_lock:
            if (game['player1_status'] == 'online' and game['player2_status'] == 'online' and 
                not game.get('game_running', False)):
                game['game_running'] = True  # Prevent multiple loop starts
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'game_start',
                        'message': 'Both players are online, game starting in 2 seconds...',
                        'game_id': self.game_id
                    }
                )
                await asyncio.sleep(2)
                self.game_task = asyncio.create_task(self.game_update_loop())

        if game['player1_status'] != 'online' or game['player2_status'] != 'online':
            await self.send(text_data=json.dumps({
                'type': 'status',
                'message': 'Waiting for the other player to connect...'
            }))

    async def disconnect(self, close_code):
        try:
            from .views import games
        except ImportError as e:
            logger.error(f"Error importing views on disconnect: {e}")
            return

        if self.game_task:
            self.game_task.cancel()
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        async with games_lock:
            game = games.get(self.game_id)
            if game and hasattr(self, 'client_id'):
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
            logger.error(f"Error importing views in receive: {e}")
            await self.send(text_data=json.dumps({'type': 'error', 'error': 'Internal server error'}))
            return

        try:
            data = json.loads(text_data)
            action = data['action']
            player_id = data['player_id']
            paddle = data.get('paddle')
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON: {e}")
            return

        async with games_lock:
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

            if game.get('status') == 'Done':
                await self.send(text_data=json.dumps({'status': 'Done'}))
                return

            player = 'player1' if game['player_1'] == player_id else 'player2'
            if game['game_opponent'] == 'local':
                if player_id != game['player_1']:
                    return
                target_paddle = paddle
                if not target_paddle or target_paddle not in ['player1', 'player2']:
                    logger.debug(f"Invalid paddle: {paddle}")
                    return
                if action in ['wStart', 'upStart']:
                    game[f'{target_paddle}_moving'] = 'up'
                elif action in ['wStop', 'upStop']:
                    if game.get(f'{target_paddle}_moving') == 'up':
                        game[f'{target_paddle}_moving'] = None
                elif action in ['sStart', 'downStart']:
                    game[f'{target_paddle}_moving'] = 'down'
                elif action in ['sStop', 'downStop']:
                    if game.get(f'{target_paddle}_moving') == 'down':
                        game[f'{target_paddle}_moving'] = None
            else:
                if action == 'upStart':
                    game[f'{player}_moving'] = 'up'
                elif action == 'upStop':
                    if game.get(f'{player}_moving') == 'up':
                        game[f'{player}_moving'] = None
                elif action == 'downStart':
                    game[f'{player}_moving'] = 'down'
                elif action == 'downStop':
                    if game.get(f'{player}_moving') == 'down':
                        game[f'{player}_moving'] = None

    async def game_update_loop(self):
        try:
            from .views import games, game_update
        except ImportError as e:
            logger.error(f"Error importing views in game_update_loop: {e}")
            return

        frame_rate = 60
        frame_duration = 1 / frame_rate
        last_frame_time = time.time()

        while True:
            current_time = time.time()
            elapsed = current_time - last_frame_time

            if elapsed < frame_duration:
                await asyncio.sleep(frame_duration - elapsed)
                current_time = time.time()

            async with games_lock:
                game = games.get(self.game_id)
                if not game:
                    logger.warning(f"Game {self.game_id} not found in update loop")
                    break

                # Check disconnection timeout
                now = datetime.utcnow()
                for player, status_key, disconnect_key, opponent_score_key in [
                    ('player1', 'player1_status', 'player1_disconnect_time', 'score2'),
                    ('player2', 'player2_status', 'player2_disconnect_time', 'score1')
                ]:
                    if game[status_key] == 'offline' and game[disconnect_key]:
                        disconnect_duration = (now - game[disconnect_key]).total_seconds()
                        if disconnect_duration > 5:
                            game[opponent_score_key] = 7
                            game['status'] = 'Done'
                            game['winner'] = game['player_2'] if player == 'player1' else game['player_1']
                            logger.info(f"Player {game[player + '_1' if player == 'player1' else 'player_2']} disconnected for >5s, {game['winner']} wins game {self.game_id}")
                            await self.channel_layer.group_send(
                                self.room_group_name,
                                {'type': 'game_state', 'game_state': game}
                            )
                            del games[self.game_id]
                            return

                # Update paddle positions
                for player in ['player1', 'player2']:
                    paddle = 'paddle1_y' if player == 'player1' else 'paddle2_y'
                    if game.get(f'{player}_moving') == 'up':
                        game[paddle] = max(0 + game['paddle_bounds_y'], game[paddle] - game['paddle_speed'])
                    elif game.get(f'{player}_moving') == 'down':
                        game[paddle] = min(1 - game['paddle_bounds_y'], game[paddle] + game['paddle_speed'])

                # Game update
                updated_game = await game_update(self.game_id)
                if not updated_game:
                    logger.warning(f"Game update failed for {self.game_id}")
                    break
                game.update(updated_game)

                if game.get('status') == 'Done':
                    logger.info(f"Game {self.game_id} finished normally")
                    await self.channel_layer.group_send(
                        self.room_group_name,
                        {'type': 'game_state', 'game_state': game}
                    )
                    del games[self.game_id]
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
            'game_opponent': game['game_opponent']
        }))

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
            'game_opponent': game['game_opponent']
        }
        if game.get('status') == 'Done':
            state['status'] = 'Done'
            state['winner'] = game.get('winner', 'Unknown')
        await self.send(text_data=json.dumps(state))

    async def game_start(self, event):
        await self.send(text_data=json.dumps({
            'type': 'game_start',
            'message': event['message'],
            'game_id': event['game_id']
        }))