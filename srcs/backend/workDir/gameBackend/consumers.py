import json
import asyncio
from channels.generic.websocket import AsyncWebsocketConsumer

class PongConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        try:
            from .views import games  # Lazy import to avoid AppRegistryNotReady error
        except ImportError as e:
            await self.close()
            return

        self.game_id = self.scope['url_route']['kwargs']['game_id']
        self.player_1_id = self.scope['url_route']['kwargs']['user_id']
        self.game_opponent = self.scope['url_route']['kwargs']['game_opponent']
        self.room_group_name = f'pong_{self.game_id}'
        
        if self.game_id not in games:
            await self.close()
            return
        
        game = games[self.game_id]

        if self.player_1_id != game['player_1'] and self.player_1_id != game['player_2']:
            await self.close()
            return
        
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

        asyncio.create_task(self.game_update_loop())

    async def disconnect(self, close_code):
        try:
            from .views import games 
        except ImportError as e:
            print(f'Error: {str(e)}')
            return
        
        try:
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )
        except Exception as e:
            print(f'Error: {str(e)}')

    async def receive(self, text_data):
        try:
            from .views import games 
        except ImportError as e:
            await self.send(text_data=json.dumps({'error': 'Internal server error'}))
            return

        text_data_json = json.loads(text_data)
        action = text_data_json['action']
        player_id = text_data_json['player_id']

        if action not in ['up', 'down']:
            await self.send(text_data=json.dumps({'error': 'Invalid action'}))
            return
        
        game_state = games.get(self.game_id)
        if not game_state:
            await self.send(text_data=json.dumps({'error': 'Game not found'}))
            return

        if player_id != game_state['player_1'] and player_id != game_state['player_2']:
            await self.send(text_data=json.dumps({'error': 'Invalid player'}))
            return
        
        if game_state['player_1'] == player_id:
            player = 'player1'
        elif game_state['player_2'] == player_id:
            player = 'player2'
        
        if action == 'up':
            if player == 'player1':
                game_state['paddle1_y'] = max(0 + game_state['paddle_bounds_y'], game_state['paddle1_y'] - game_state['paddle_speed'])
            elif player == 'player2':
                game_state['paddle2_y'] = max(0 + game_state['paddle_bounds_y'], game_state['paddle2_y'] - game_state['paddle_speed'])
        elif action == 'down':
            if player == 'player1':
                game_state['paddle1_y'] = min(1 - game_state['paddle_bounds_y'], game_state['paddle1_y'] + game_state['paddle_speed'])
            elif player == 'player2':
                game_state['paddle2_y'] = min(1 - game_state['paddle_bounds_y'], game_state['paddle2_y'] + game_state['paddle_speed'])
        
        await self.send(text_data=json.dumps({'success': True}))

    async def game_update_loop(self):
        try:
            from .views import games, game_update 
        except ImportError as e:
            print(f'Error: {str(e)}')
            return

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