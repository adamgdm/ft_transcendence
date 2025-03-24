import json
import asyncio
from datetime import datetime, timedelta
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from authentication.utils import decode_jwt_token
from authentication.models import BlacklistedTokens, LoggedOutTokens, Users
from django.db.models import Q
from .models import Tournament, Match  # Added Match for database check
import logging
import time

logger = logging.getLogger(__name__)

# Global lock for thread-safe access to games dict
games_lock = asyncio.Lock()

class PongConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for managing Pong games, including player connections,
    game state updates, and tournament result reporting.
    """

    @database_sync_to_async
    def check_ws_auth(self, scope):
        """Authenticate WebSocket connection using JWT token from cookies."""
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
        """Handle WebSocket connection setup and game initialization."""
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

        # Authenticate client
        self.client_id, result = await self.check_ws_auth(self.scope)
        if not self.client_id:
            logger.info(f"Auth failed for game {self.game_id}: {result}")
            await self.close(code=4001, reason=result)
            return

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

        # Wait for game to be initialized
        game = await self.wait_for_game(games)
        if not game:
            return  # Error already logged and client notified in wait_for_game

        # Validate player participation
        if self.client_id not in [game['player_1'], game['player_2']]:
            logger.warning(f"Client {self.client_id} not in game {self.game_id}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'error': 'You are not a player in this game'
            }))
            await self.close(code=4002, reason="Unauthorized player")
            return

        # Update player status
        async with games_lock:
            if self.client_id == game['player_1']:
                game['player1_status'] = 'online'
                game['player1_disconnect_time'] = None
            elif self.client_id == game['player_2']:
                game['player2_status'] = 'online'
                game['player2_disconnect_time'] = None

        await self.send_initial_state(game)

        # Start game if both players are online
        async with games_lock:
            if (game['player1_status'] == 'online' and 
                game['player2_status'] == 'online' and 
                not game.get('game_running', False)):
                game['game_running'] = True
                logger.info(f"Starting game {self.game_id}: {game['player_1']} vs {game['player_2']}")
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'game_start',
                        'message': 'Both players online, game starts in 2 seconds...',
                        'game_id': self.game_id
                    }
                )
                await asyncio.sleep(2)
                self.game_task = asyncio.create_task(self.game_update_loop())

        # Notify if waiting for opponent
        if game['player1_status'] != 'online' or game['player2_status'] != 'online':
            await self.send(text_data=json.dumps({
                'type': 'status',
                'message': 'Waiting for the other player to connect...'
            }))

    async def wait_for_game(self, games):
        """Wait for game to initialize with a timeout."""
        timeout = 30
        elapsed = 0
        while elapsed < timeout:
            async with games_lock:
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
        """Handle WebSocket disconnection."""
        try:
            from .views import games
        except ImportError as e:
            logger.error(f"Cannot import views on disconnect: {e}")
            return

        if self.game_task:
            self.game_task.cancel()
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

        async with games_lock:
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
        """Handle incoming WebSocket messages (e.g., paddle movements)."""
        try:
            from .views import games
        except ImportError as e:
            logger.error(f"Cannot import views in receive: {e}")
            await self.send(text_data=json.dumps({'type': 'error', 'error': 'Internal server error'}))
            return

        try:
            data = json.loads(text_data)
            action = data['action']
            player_id = data['player_id']
            paddle = data.get('paddle')
        except (json.JSONDecodeError, KeyError) as e:
            logger.error(f"Invalid message: {e}")
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

            if game.get('status') == 'done':
                await self.send(text_data=json.dumps({'status': 'Done'}))
                return

            player = 'player1' if game['player_1'] == player_id else 'player2'
            if game['game_opponent'] == 'local':
                if player_id != game['player_1']:
                    logger.debug(f"Invalid player_id {player_id} for local game")
                    return
                target_paddle = paddle
                if not target_paddle or target_paddle not in ['player1', 'player2']:
                    logger.debug(f"Invalid paddle: {paddle}")
                    return
                self.update_paddle(game, target_paddle, action)
            else:
                self.update_paddle(game, player, action)

    def update_paddle(self, game, paddle, action):
        """Update paddle movement state based on action."""
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
        """Main game loop: update state, check for end, report tournament results."""
        try:
            from .views import games, game_update
        except ImportError as e:
            logger.error(f"Cannot import views in game_update_loop: {e}")
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

                # Handle player disconnection
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
                            logger.info(f"Player {game[player + '_1' if player == 'player1' else 'player_2']} disconnected >7s, {game['winner']} wins game {self.game_id}")
                            await self.end_game(game)
                            return

                # Update paddle positions
                for player in ['player1', 'player2']:
                    paddle = 'paddle1_y' if player == 'player1' else 'paddle2_y'
                    if game.get(f'{player}_moving') == 'up':
                        game[paddle] = max(0 + game['paddle_bounds_y'], game[paddle] - game['paddle_speed'])
                    elif game.get(f'{player}_moving') == 'down':
                        game[paddle] = min(1 - game['paddle_bounds_y'], game[paddle] + game['paddle_speed'])

                # Apply game update
                updated_game = await game_update(self.game_id)
                if not updated_game:
                    logger.error(f"Game update failed for {self.game_id}")
                    break
                game.update(updated_game)

                # Log current state for debugging
                logger.debug(f"Game {self.game_id} state: status={game.get('status')}, score1={game['score1']}, score2={game['score2']}")

                # Check if game ended (in-memory or database)
                if await self.check_game_end(game):
                    await self.end_game(game)
                    break

            await self.channel_layer.group_send(
                self.room_group_name,
                {'type': 'game_state', 'game_state': game}
            )
            last_frame_time = current_time

    async def check_game_end(self, game):
        """Check if the game has ended, using in-memory state or database fallback."""
        if game.get('status') == 'done':
            logger.info(f"Game {self.game_id} ended (in-memory), winner: {game['winner']}")
            return True

        # Fallback to database check
        try:
            match = await database_sync_to_async(Match.objects.get)(id=self.game_id)
            if match.match_status == 'done':
                logger.info(f"Game {self.game_id} ended (database), winner: {match.match_winner.user_name}")
                game['status'] = 'done'
                game['winner'] = match.match_winner.user_name
                tournament = await database_sync_to_async(Tournament.objects.filter(
                    Q(semifinal_1=match) | Q(semifinal_2=match) | Q(final=match)
                ).first)()
                if tournament:
                    game['tournament_id'] = str(tournament.id)
                    game['report_result'] = True
                return True
        except Match.DoesNotExist:
            logger.error(f"Match {self.game_id} not found in database")
        return False

    async def end_game(self, game):
        """Handle game end, including tournament result reporting."""
        if game.get('report_result') and game.get('tournament_id'):
            participants = await database_sync_to_async(lambda: list(
                Tournament.objects.get(id=game['tournament_id']).participants.all()
            ))()
            for participant in participants:
                logger.info(f"Sending report_match_result for game {self.game_id} to {participant.id}")
                await self.channel_layer.group_send(
                    f"friendship_group_{participant.id}",
                    {
                        'type': 'report_match_result',
                        'game_id': self.game_id,
                        'winner': game['winner'],
                        'tournament_id': game['tournament_id']
                    }
                )
        async with games_lock:
            if self.game_id in games:
                del games[self.game_id]

    async def send_initial_state(self, game):
        """Send initial game state to the client."""
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
        """Send updated game state to the client."""
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
        if game.get('status') == 'done':
            state['status'] = 'done'
            state['winner'] = game.get('winner', 'Unknown')
        await self.send(text_data=json.dumps(state))

    async def game_start(self, event):
        """Notify client that the game is starting."""
        await self.send(text_data=json.dumps({
            'type': 'game_start',
            'message': event['message'],
            'game_id': event['game_id']
        }))