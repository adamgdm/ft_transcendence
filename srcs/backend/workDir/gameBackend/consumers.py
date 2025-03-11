import json
import asyncio
from channels.generic.websocket import AsyncWebsocketConsumer

# Define the lock globally
games_lock = asyncio.Lock()

class PongConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        try:
            from .views import games  # Lazy import to avoid AppRegistryNotReady error
        except ImportError as e:
            print(f"Error importing views: {str(e)}")
            await self.close()
            return

        self.game_id = self.scope['url_route']['kwargs']['game_id']
        self.client_id = self.scope['url_route']['kwargs']['user_id']
        self.room_group_name = f'pong_{self.game_id}'

        async with games_lock:
            while self.game_id not in games:
                print(f"Game ID {self.game_id} not found in games")
                await asyncio.sleep(1)

            game = games[self.game_id]

            if self.client_id not in [game['player_1'], game['player_2']]:
                print(f"Client ID {self.client_id} not recognized as player in game {self.game_id}")
                await self.close()
                return

            if self.client_id == game['player_1']:
                game['player1_status'] = 'online'
            elif self.client_id == game['player_2']:
                game['player2_status'] = 'online'

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

        await self.send(text_data=json.dumps({
            'paddle1_x': game['paddle1_x'],
            'paddle2_x': game['paddle2_x'],
            'ball_bounds': game['ball_bounds'],
            'paddle_bounds_x': game['paddle_bounds_x'],
            'paddle_bounds_y': game['paddle_bounds_y']
        }))

        if game['game_opponent'] in ['same_computer', 'AI']:
            await self.send(text_data=json.dumps({'message': 'Same computer or AI game, starting now...'}))
            asyncio.create_task(self.game_update_loop())
        
        # Indicate which player is online
        status = game['player1_status'] if self.client_id == game['player_1'] else game['player2_status']
        await self.send(text_data=json.dumps({'player': self.client_id, 'status': status}))

        if game['player1_status'] == 'online' and game['player2_status'] == 'online' and game['game_opponent'] == 'online':
            await self.send(text_data=json.dumps({'message': 'Both players are online, starting now...'}))
            if self.client_id == game['player_1']:
                asyncio.create_task(self.game_update_loop())
        else:
            await self.send(text_data=json.dumps({'message': 'Waiting for the other player to connect...'}))

        print(f"Player {self.client_id} connected to game {self.game_id}")

    async def disconnect(self, close_code):
        try:
            from .views import games
        except ImportError as e:
            print(f"Error importing views: {str(e)}")
            return

        try:
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )
        except Exception as e:
            print(f"Error discarding group: {str(e)}")

        async with games_lock:
            game = games.get(self.game_id, None)
            if game:
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

        if action not in ['upStart', 'upStop', 'downStart', 'downStop']:
            await self.send(text_data=json.dumps({'error': 'Invalid action'}))
            return

        async with games_lock:
            game_state = games.get(self.game_id)
            if not game_state:
                await self.send(text_data=json.dumps({'error': 'Game not found'}))
                return

            player = 'player1' if game_state['player_1'] == player_id else 'player2'

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