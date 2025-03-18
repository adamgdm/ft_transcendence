import json
import asyncio
from datetime import datetime, timedelta
from django.conf import settings
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from authentication.utils import decode_jwt_token
from authentication.models import BlacklistedTokens, LoggedOutTokens, Users

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
            
    async def connect(self):
        try:
            from .views import games
        except ImportError as e:
            print(f"Error importing views: {str(e)}")
            await self.close()
            return

        self.game_id = self.scope['url_route']['kwargs']['game_id']
        self.room_group_name = f'pong_{self.game_id}'
        
        self.client_id, result = await self.check_wsAuth(self.scope)
        if self.client_id is None:
            print(f"Authentication failed: {result}")
            await self.close()
            return

        # Wait for game to be initialized with a longer timeout
        async with games_lock:
            timeout = 30  # Increase timeout to allow for invite acceptance
            elapsed = 0
            while self.game_id not in games and elapsed < timeout:
                print(f"Game ID {self.game_id} not found in games, waiting... (elapsed: {elapsed}s)")
                await asyncio.sleep(1)
                elapsed += 1
            if self.game_id not in games:
                print(f"Timeout: Game {self.game_id} not initialized in games: {games}")
                await self.send(text_data=json.dumps({'error': 'Game not found or not yet accepted'}))
                await self.close(code=4000)
                return

            game = games[self.game_id]
            print(f"Game {self.game_id} found: {game}")

            if self.client_id not in [game['player_1'], game['player_2']]:
                print(f"Client ID {self.client_id} not recognized in game {self.game_id}")
                await self.close()
                return

            if self.client_id == game['player_1']:
                game['player1_status'] = 'online'
            elif self.client_id == game['player_2']:
                game['player2_status'] = 'online'

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

        # Send initial game state
        await self.send(text_data=json.dumps({
            'paddle1_x': game['paddle1_x'],
            'paddle2_x': game['paddle2_x'],
            'ball_bounds': game['ball_bounds'],
            'paddle_bounds_x': game['paddle_bounds_x'],
            'paddle_bounds_y': game['paddle_bounds_y']
        }))

        await self.send(text_data=json.dumps({'game_opponent': game['game_opponent']}))

        if game['player1_status'] == 'online' and game['player2_status'] == 'online':
            await self.send(text_data=json.dumps({'message': 'Both players are online, starting now...'}))
            if self.client_id == game['player_1']:
                asyncio.create_task(self.game_update_loop())
        else:
            await self.send(text_data=json.dumps({'message': 'Waiting for the other player to connect...'}))

    async def disconnect(self, close_code):
        try:
            from .views import games
        except ImportError as e:
            print(f"Error importing views: {str(e)}")
            return

        try:
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        except Exception as e:
            print(f"Error discarding group: {str(e)}")

        async with games_lock:
            game = games.get(self.game_id)
            if game and hasattr(self, 'client_id'):
                if self.client_id == game['player_1']:
                    game['player1_status'] = 'offline'
                elif self.client_id == game['player_2']:
                    game['player2_status'] = 'offline'
                print(f"Player {self.client_id} disconnected from game {self.game_id}")

    async def receive(self, text_data):
        try:
            from .views import games
        except ImportError as e:
            await self.send(text_data=json.dumps({'error': 'Internal server error'}))
            return

        text_data_json = json.loads(text_data)
        action = text_data_json['action']
        player_id = text_data_json['player_id']
        paddle = text_data_json.get('paddle')  # For local mode, specifies which paddle to control

        # Validate action based on game mode
        async with games_lock:
            game_state = games.get(self.game_id)
            if not game_state:
                await self.send(text_data=json.dumps({'error': 'Game not found'}))
                return

            valid_actions = ['upStart', 'upStop', 'downStart', 'downStop']
            if game_state['game_opponent'] == 'local':
                valid_actions.extend(['wStart', 'wStop', 'sStart', 'sStop'])

            if action not in valid_actions:
                await self.send(text_data=json.dumps({'error': 'Invalid action'}))
                return

            if game_state['status'] == 'Done':
                await self.send(text_data=json.dumps({'status': 'Done'}))

            # Determine which player is sending the action
            player = 'player1' if game_state['player_1'] == player_id else 'player2'

            # Handle actions for local mode
            if game_state['game_opponent'] == 'local':
                # In local mode, player_1 controls both paddles
                if player_id == game_state['player_1']:
                    target_paddle = paddle  # Use the paddle specified in the message ('player1' or 'player2')
                    if not target_paddle:
                        await self.send(text_data=json.dumps({'error': 'Paddle not specified in local mode'}))
                        return
                    if target_paddle not in ['player1', 'player2']:
                        await self.send(text_data=json.dumps({'error': 'Invalid paddle specified'}))
                        return

                    if action == 'wStart':
                        game_state[f'{target_paddle}_moving'] = 'up'
                    elif action == 'wStop':
                        if game_state.get(f'{target_paddle}_moving') == 'up':
                            game_state[f'{target_paddle}_moving'] = None
                    elif action == 'sStart':
                        game_state[f'{target_paddle}_moving'] = 'down'
                    elif action == 'sStop':
                        if game_state.get(f'{target_paddle}_moving') == 'down':
                            game_state[f'{target_paddle}_moving'] = None
                    elif action == 'upStart':
                        game_state[f'{target_paddle}_moving'] = 'up'
                    elif action == 'upStop':
                        if game_state.get(f'{target_paddle}_moving') == 'up':
                            game_state[f'{target_paddle}_moving'] = None
                    elif action == 'downStart':
                        game_state[f'{target_paddle}_moving'] = 'down'
                    elif action == 'downStop':
                        if game_state.get(f'{target_paddle}_moving') == 'down':
                            game_state[f'{target_paddle}_moving'] = None
                else:
                    await self.send(text_data=json.dumps({'error': f'Only player_1 can control paddles in local mode'}))
                    return
            else:
                # Online mode: each player controls their own paddle
                if action == 'upStart':
                    game_state[f'{player}_moving'] = 'up'
                elif action == 'upStop':
                    if game_state.get(f'{player}_moving') == 'up':
                        game_state[f'{player}_moving'] = None
                elif action == 'downStart':
                    game_state[f'{player}_moving'] = 'down'
                elif action == 'downStop':
                    if game_state.get(f'{player}_moving') == 'down':
                        game_state[f'{player}_moving'] = None

        await self.send(text_data=json.dumps({'success': True}))

    async def game_update_loop(self):
        try:
            from .views import games, game_update
        except ImportError as e:
            print(f"Error importing views: {str(e)}")
            return

        async with games_lock:
            game_state = games.get(self.game_id)

        if not game_state:
            return

        score1 = game_state['score1']
        score2 = game_state['score2']
        await asyncio.sleep(1)

        frame_rate = 60
        frame_duration = 1 / frame_rate

        while True:
            start_time = asyncio.get_event_loop().time()

            game_state = await game_update(self.game_id)
            if not game_state:
                await self.channel_layer.group_discard(
                    self.room_group_name,
                    self.channel_name
                )
                break

            if game_state.get('status') == 'Done':
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'game_state',
                        'game_state': game_state
                    }
                )
                await self.channel_layer.group_discard(
                    self.room_group_name,
                    self.channel_name
                )
                async with games_lock:
                    del games[self.game_id]
                break

            # Update paddle positions based on movement state
            for player in ['player1', 'player2']:
                paddle = 'paddle1_y' if player == 'player1' else 'paddle2_y'
                if game_state.get(f'{player}_moving') == 'up':
                    game_state[paddle] = max(0 + game_state['paddle_bounds_y'], game_state[paddle] - game_state['paddle_speed'])
                elif game_state.get(f'{player}_moving') == 'down':
                    game_state[paddle] = min(1 - game_state['paddle_bounds_y'], game_state[paddle] + game_state['paddle_speed'])

            if score1 != game_state['score1'] or score2 != game_state['score2']:
                score1 = game_state['score1']
                score2 = game_state['score2']

            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'game_state',
                    'game_state': game_state
                }
            )

            end_time = asyncio.get_event_loop().time()
            elapsed_time = end_time - start_time

            await asyncio.sleep(max(0, frame_duration - elapsed_time))

    async def game_state(self, event):
        game_send = event['game_state']
        game_state = {
            'ball_x': game_send['ball_x'],
            'ball_y': game_send['ball_y'],
            'paddle1_y': game_send['paddle1_y'],
            'paddle2_y': game_send['paddle2_y'],
            'score1': game_send['score1'],
            'score2': game_send['score2']
        }
        await self.send(text_data=json.dumps(game_state))