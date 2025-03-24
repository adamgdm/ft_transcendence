import json
import asyncio
from datetime import datetime, timedelta
from django.conf import settings
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from authentication.utils import decode_jwt_token
from authentication.models import BlacklistedTokens, LoggedOutTokens, Users
from gameBackend.models import GameInvites, Match, Tournament
from django.db.models import Q
from .models import Friendship
from channels.db import database_sync_to_async
import logging

logger = logging.getLogger(__name__)

from gameBackend.views import games, create_new_game

game_locks = {}

class FriendshipConsumer(AsyncWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.game_locks = game_locks

    @database_sync_to_async
    def check_wsAuth(self):
        token = self.scope["cookies"].get("token")
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
            return user, "Success"
        except Users.DoesNotExist:
            return None, "User not found"
        except Exception as e:
            logger.error(f"Error during authentication: {e}")
            return None, "Authentication failed"

    @database_sync_to_async
    def get_pending_friend_requests(self, user):
        pending_requests = Friendship.objects.filter(
            to_user=user,
            friendship_status='pending'
        ).select_related('from_user')
        
        return [{
            'request_id': friendship.id,
            'from_user_id': friendship.from_user.id,
            'from_username': friendship.from_user.user_name,
            'timestamp': friendship.created_at.isoformat() if hasattr(friendship, 'created_at') else None
        } for friendship in pending_requests]

    @database_sync_to_async
    def get_pending_game_invites(self, user):
        invites = GameInvites.objects.filter(
            to_user=user,
            status=GameInvites.GameInviteStatus.PENDING
        ).select_related('from_user')
        
        return [{
            'invite_id': invite.id,
            'from_user_id': invite.from_user.id,
            'from_username': invite.from_user.user_name,
            'game_mode': invite.game_mode,
            'issued_at': invite.issued_at.isoformat()
        } for invite in invites]

    async def connect(self):
        self.user, result = await self.check_wsAuth()
        if self.user is None:
            logger.info(f"Authentication failed: {result}")
            await self.close()
            return
        
        self.group_name = f"friendship_group_{self.user.id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        
        await self.accept()

        pending_friend_requests = await self.get_pending_friend_requests(self.user)
        if pending_friend_requests:
            await self.send(text_data=json.dumps({
                'type': 'pending_friend_requests',
                'requests': pending_friend_requests
            }))

        pending_game_invites = await self.get_pending_game_invites(self.user)
        if pending_game_invites:
            await self.send(text_data=json.dumps({
                'type': 'pending_game_invites',
                'invites': pending_game_invites
            }))

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        await self.update_user_online_status()

    @database_sync_to_async
    def update_user_online_status(self):
        return

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            message_type = data.get('type')

            if message_type == "send_friend_request":
                await self.handle_send_friend_request(data)
            elif message_type == "accept_friend_request":
                await self.handle_accept_friend_request(data)
            elif message_type == "reject_friend_request":
                await self.handle_reject_friend_request(data)
            elif message_type == "cancel_friend_request":
                await self.handle_cancel_friend_request(data)
            elif message_type == "send_game_invite":
                await self.handle_send_game_invite(data)
            elif message_type == "accept_game_invite":
                await self.handle_accept_game_invite(data)
            elif message_type == "reject_game_invite":
                await self.handle_reject_game_invite(data)
            elif message_type == "create_local_game":
                await self.handle_create_local_game(data)
            elif message_type == "create_tournament":
                await self.handle_create_tournament(data)
            elif message_type == "accept_tournament_invite":
                await self.handle_accept_tournament_invite(data)
            elif message_type == "report_match_result":
                await self.handle_match_result(data)
            else:
                logger.warning(f"Unknown message type: {message_type}")
        except json.JSONDecodeError:
            logger.error("Invalid JSON data received")

    async def handle_send_friend_request(self, data):
        friend_username = data.get('friend_username')
        if not friend_username:
            logger.error("Missing friend_username in send_friend_request")
            await self.send(text_data=json.dumps({
                'type': 'friend_request_error',
                'error': 'Missing friend_username'
            }))
            return

        friendship = await self.create_friend_request(self.user.id, friend_username)
        if friendship:
            await self.channel_layer.group_send(
                f"friendship_group_{friendship.to_user.id}",
                {
                    'type': 'new_friend_request_notification',
                    'request_id': friendship.id,
                    'from_user_id': self.user.id,
                    'from_username': self.user.user_name
                }
            )
            await self.send(text_data=json.dumps({
                'type': 'friend_request_sent',
                'friend_username': friend_username,
                'message': 'Friend request sent successfully'
            }))
        else:
            await self.send(text_data=json.dumps({
                'type': 'friend_request_error',
                'friend_username': friend_username,
                'error': 'Friend request already exists or user not found'
            }))

    async def handle_accept_friend_request(self, data):
        friend_username = data.get('friend_username')
        if not friend_username:
            logger.error("Missing friend_username in accept_friend_request")
            await self.send(text_data=json.dumps({
                'type': 'friend_request_error',
                'error': 'Missing friend_username'
            }))
            return

        friendship = await self.process_friend_request(friend_username, Friendship.Status.ACCEPTED)
        if friendship:
            await self.channel_layer.group_send(
                f"friendship_group_{friendship.from_user.id}",
                {
                    'type': 'friend_request_accepted_notification',
                    'request_id': friendship.id,
                    'from_user_id': self.user.id,
                    'from_username': self.user.user_name
                }
            )
            await self.send(text_data=json.dumps({
                'type': 'friend_request_accepted',
                'friend_username': friend_username,
                'message': 'Friend request accepted successfully'
            }))
        else:
            await self.send(text_data=json.dumps({
                'type': 'friend_request_error',
                'friend_username': friend_username,
                'error': 'No pending friend request found from this user'
            }))

    async def handle_accept_game_invite(self, data):
        invite_id = data.get('invite_id')
        if not invite_id:
            await self.send(text_data=json.dumps({
                'type': 'game_invite_error',
                'error': 'Missing invite_id'
            }))
            return

        result = await self.accept_game_invite(invite_id, self.user)
        if result and 'error' in result:
            await self.send(text_data=json.dumps({
                'type': 'game_invite_error',
                'invite_id': invite_id,
                'error': result['error']
            }))
            return
        
        if result.get('tournament'):
            logger.info(f"Tournament invite {invite_id} accepted, processing tournament logic")
            await self.handle_accept_tournament_invite({
                'invite_id': invite_id,
                'tournament_id': result['tournament_id']
            })
            return
        
        if 'game_id' in result and 'from_user_id' in result and 'from_username' in result:
            game_id = result['game_id']
            from_user_id = result['from_user_id']
            from_username = result['from_username']
            to_username = self.user.user_name
                
            lock = self.game_locks.setdefault(game_id, asyncio.Lock())
            async with lock:
                if game_id not in games:
                    games[game_id] = create_new_game(to_username, from_username, 'online')
                    games[game_id]['player1_status'] = 'online'
                    games[game_id]['player2_status'] = 'online'

            await self.channel_layer.group_send(
                f"friendship_group_{from_user_id}",
                {
                    'type': 'game_invite_accepted_notification',
                    'invite_id': invite_id,
                    'game_id': game_id,
                    'to_username': to_username
                }
            )
            await self.send(text_data=json.dumps({
                'type': 'game_invite_accepted',
                'invite_id': invite_id,
                'game_id': game_id,
                'message': 'Game invite accepted, starting game'
            }))

    async def handle_cancel_friend_request(self, data):
        friend_username = data.get('friend_username')
        if not friend_username:
            logger.error("Missing friend_username in cancel_friend_request")
            await self.send(text_data=json.dumps({
                'type': 'friend_request_error',
                'error': 'Missing friend_username'
            }))
            return

        success = await self.cancel_friend_request(self.user.id, friend_username)
        if success:
            await self.send(text_data=json.dumps({
                'type': 'friend_request_cancelled',
                'friend_username': friend_username,
                'message': 'Friend request cancelled successfully'
            }))
        else:
            await self.send(text_data=json.dumps({
                'type': 'friend_request_error',
                'friend_username': friend_username,
                'error': 'Failed to cancel friend request'
            }))

    async def handle_send_game_invite(self, data):
        to_username = data.get('to_username')
        game_mode = data.get('game_mode', 'online')
        tournament_id = data.get('tournament_id')
        if not to_username:
            await self.send(text_data=json.dumps({'type': 'game_invite_error', 'error': 'Missing to_username'}))
            return
        if game_mode not in GameInvites.GameModes.values:
            await self.send(text_data=json.dumps({'type': 'game_invite_error', 'error': 'Invalid game mode'}))
            return
        
        invite = await self.create_game_invite(self.user.id, to_username, game_mode, tournament_id)
        if invite:
            await self.channel_layer.group_send(
                f"friendship_group_{invite.to_user.id}",
                {
                    'type': 'new_game_invite_notification',
                    'invite_id': invite.id,
                    'from_user_id': self.user.id,
                    'from_username': self.user.user_name,
                    'game_mode': game_mode,
                    'tournament_id': tournament_id
                }
            )
            await self.send(text_data=json.dumps({
                'type': 'game_invite_sent',
                'to_username': to_username,
                'invite_id': invite.id,
                'tournament_id': tournament_id,
                'message': 'Game invite sent successfully'
            }))
        else:
            await self.send(text_data=json.dumps({
                'type': 'game_invite_error',
                'to_username': to_username,
                'error': 'Failed to send game invite'
            }))

    async def handle_create_local_game(self, data):
        user = data.get('user')
        if not user or user != self.user.user_name:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'user': user,
                'message': 'Invalid or missing user'
            }))
            return

        try:
            game = await self.create_local_game(self.user)
            game_id = str(game.id)
            
            lock = self.game_locks.setdefault(game_id, asyncio.Lock())
            async with lock:
                if game_id not in games:
                    games[game_id] = create_new_game(self.user.user_name, self.user.user_name, 'local')
                    games[game_id]['player1_status'] = 'online'
                    games[game_id]['player2_status'] = 'online'
                    games[game_id]['status'] = 'Playing'
            
            await self.send(text_data=json.dumps({
                'type': 'local_game_created',
                'game_id': game_id,
                'user': self.user.user_name,
                'message': 'Local game created successfully'
            }))
        except Exception as e:
            logger.error(f"Error creating local game: {e}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'user': user,
                'message': f'Failed to create local game: {str(e)}'
            }))

    @database_sync_to_async
    def accept_game_invite(self, invite_id, user):
        try:
            invite = GameInvites.objects.get(
                id=invite_id,
                to_user=user,
                status=GameInvites.GameInviteStatus.PENDING
            )
            if invite.game_mode == 'tournament':
                logger.info(f"Tournament invite {invite_id} detected, deferring to tournament logic")
                return {'tournament': True, 'tournament_id': invite.game_id}
            
            from_user = invite.from_user
            game_name = f"{from_user.user_name} vs {user.user_name}"
            game = Match.objects.create(
                match_name=game_name,
                player_1=user,
                player_2=from_user, 
                game_opponent='online'
            )
            invite.status = GameInvites.GameInviteStatus.ACCEPTED
            invite.game_id = str(game.id)
            invite.save()
            return {
                'game_id': str(game.id),
                'from_user_id': from_user.id,
                'from_username': from_user.user_name
            }
        except GameInvites.DoesNotExist:
            return {'error': 'Pending game invite not found'}
        except Exception as e:
            logger.error(f"Error accepting game invite: {e}")
            return {'error': str(e)}

    async def handle_reject_game_invite(self, data):
        invite_id = data.get('invite_id')
        if not invite_id:
            await self.send(text_data=json.dumps({
                'type': 'game_invite_error',
                'error': 'Missing invite_id'
            }))
            return

        success = await self.reject_game_invite(invite_id, self.user)
        if success:
            from_user_id = success['from_user_id']
            await self.channel_layer.group_send(
                f"friendship_group_{from_user_id}",
                {
                    'type': 'game_invite_rejected_notification',
                    'invite_id': invite_id,
                    'from_username': self.user.user_name
                }
            )
            await self.send(text_data=json.dumps({
                'type': 'game_invite_rejected',
                'invite_id': invite_id,
                'message': 'Game invite rejected successfully'
            }))
        else:
            await self.send(text_data=json.dumps({
                'type': 'game_invite_error',
                'invite_id': invite_id,
                'error': 'Failed to reject game invite'
            }))

    @database_sync_to_async
    def create_local_game(self, user):
        try:
            game_name = f"{user.user_name} (Local)"
            game = Match.objects.create(
                match_name=game_name,
                player_1=user,
                player_2=user,
                game_opponent='local'
            )
            return game
        except Exception as e:
            logger.error(f"Error in create_local_game: {e}")
            raise e

    @database_sync_to_async
    def create_friend_request(self, from_user_id, to_user_username):
        try:
            from_user = Users.objects.get(id=from_user_id)
            to_user = Users.objects.get(user_name=to_user_username)

            existing_friendship = Friendship.objects.filter(
                Q(from_user=from_user, to_user=to_user) | Q(from_user=to_user, to_user=from_user)
            ).first()
            if existing_friendship:
                logger.info(f"Friendship already exists between {from_user.user_name} and {to_user.user_name}")
                return None

            friendship = Friendship.objects.create(
                from_user=from_user,
                to_user=to_user,
                friendship_status=Friendship.Status.PENDING
            )
            return friendship
        except Users.DoesNotExist:
            logger.error(f"User not found: from_user_id={from_user_id}, to_user_username={to_user_username}")
            return None
        except Exception as e:
            logger.error(f"Error creating friend request: {e}")
            return None

    @database_sync_to_async
    def process_friend_request(self, friend_username, status):
        try:
            friendship = Friendship.objects.select_related('from_user').get(
                from_user__user_name=friend_username,
                to_user=self.user,
                friendship_status=Friendship.Status.PENDING
            )
            if status == Friendship.Status.REJECTED:
                friendship.delete()
                return True
            friendship.friendship_status = status
            friendship.save()
            return friendship
        except Friendship.DoesNotExist:
            logger.error(f"Friend request not found for user: {friend_username} to accept/reject by {self.user.user_name}")
            return False

    @database_sync_to_async
    def cancel_friend_request(self, from_user_id, to_user_username):
        try:
            from_user = Users.objects.get(id=from_user_id)
            to_user = Users.objects.get(user_name=to_user_username)
            friendship = Friendship.objects.get(
                from_user=from_user,
                to_user=to_user,
                friendship_status=Friendship.Status.PENDING
            )
            friendship.delete()
            return True
        except (Users.DoesNotExist, Friendship.DoesNotExist):
            logger.error(f"Friend request not found to cancel: from_user_id={from_user_id}, to_user_username={to_user_username}")
            return False
        except Exception as e:
            logger.error(f"Error cancelling friend request: {e}")
            return False

    @database_sync_to_async
    def create_game_invite(self, from_user_id, to_username, game_mode, tournament_id=None):
        try:
            from_user = Users.objects.get(id=from_user_id)
            to_user = Users.objects.get(user_name=to_username)

            if from_user == to_user:
                return None

            if GameInvites.objects.filter(
                from_user=from_user,
                to_user=to_user,
                status=GameInvites.GameInviteStatus.PENDING
            ).exists():
                return None

            invite = GameInvites.objects.create(
                from_user=from_user,
                to_user=to_user,
                game_mode=game_mode,
                status=GameInvites.GameInviteStatus.PENDING,
                game_id=tournament_id if game_mode == 'tournament' else None
            )
            return invite
        except Users.DoesNotExist:
            logger.error(f"User not found: from_user_id={from_user_id}, to_username={to_username}")
            return None
        except Exception as e:
            logger.error(f"Error creating game invite: {e}")
            return None

    @database_sync_to_async
    def reject_game_invite(self, invite_id, user):
        try:
            invite = GameInvites.objects.get(
                id=invite_id,
                to_user=user,
                status=GameInvites.GameInviteStatus.PENDING
            )
            from_user_id = invite.from_user.id
            invite.status = GameInvites.GameInviteStatus.REFUSED
            invite.save()
            return {'from_user_id': from_user_id}
        except GameInvites.DoesNotExist:
            return False
        except Exception as e:
            logger.error(f"Error rejecting game invite: {e}")
            return False

    @database_sync_to_async
    def create_tournament(self, creator, tournament_name):
        ###########################################
        ####         create tournament         ####
        ###########################################
        tournament = Tournament.objects.create(
            tournament_name=tournament_name,
            ###   blockchain id   ###
            creator=creator,
            status='pending'
        )
        tournament.participants.add(creator)  # Creator is a participant
        logger.info(f"Tournament {tournament.id} created by {creator.user_name} with 1 participant")
        return tournament

    @database_sync_to_async
    def check_tournament_timeout(self, tournament_id):
        try:
            from django.utils import timezone
            tournament = Tournament.objects.get(id=tournament_id)
            if tournament.status == 'pending' and (timezone.now() - tournament.creation_date).total_seconds() > 300:
                tournament.status = 'cancelled'
                tournament.save()
                logger.info(f"Tournament {tournament_id} cancelled due to timeout")
                return True
            return False
        except Tournament.DoesNotExist:
            return False

    async def handle_create_tournament(self, data):
        tournament_name = data.get('tournament_name')
        invited_usernames = data.get('invited_usernames', [])
        logger.info(f"Creating tournament: {tournament_name} by {self.user.user_name}, invited: {invited_usernames}")
        
        tournament = await self.create_tournament(self.user, tournament_name)
        participant_count = await database_sync_to_async(lambda: tournament.participants.count())()
        logger.info(f"Tournament {tournament.id} created, initial participant count: {participant_count}")
        
        await self.send(text_data=json.dumps({
            'type': 'tournament_created',
            'tournament_id': tournament.id,
            'tournament_name': tournament_name,
            'invited_usernames': invited_usernames
        }))

        for username in invited_usernames:
            await self.handle_send_game_invite({
                'to_username': username,
                'game_mode': 'tournament',
                'tournament_id': tournament.id
            })
        asyncio.create_task(self.timeout_tournament(tournament.id))

    async def timeout_tournament(self, tournament_id):
        await asyncio.sleep(300)  # Wait 5 minutes
        if await self.check_tournament_timeout(tournament_id):
            participants = await database_sync_to_async(lambda: list(Tournament.objects.get(id=tournament_id).participants.all()))()
            for participant in participants:
                await self.channel_layer.group_send(
                    f"friendship_group_{participant.id}",
                    {'type': 'tournament_error', 'error': 'Tournament timed out', 'tournament_id': tournament_id}
                )

    @database_sync_to_async
    def accept_tournament_invite(self, invite_id, user, tournament_id):
        try:
            invite = GameInvites.objects.get(id=invite_id, to_user=user, status='pending', game_mode='tournament')
            tournament = Tournament.objects.get(id=tournament_id, status='pending')
            participant_count = tournament.participants.count()
            logger.info(f"Processing invite {invite_id} for tournament {tournament_id}, current participants: {participant_count}")
            
            if participant_count >= 4:
                logger.warning(f"Tournament {tournament_id} is already full with {participant_count} participants")
                return {'error': 'Tournament is full'}
            
            if user in tournament.participants.all():
                logger.warning(f"User {user.user_name} already in tournament {tournament_id}")
                return {'error': 'User already in tournament'}
            
            invite.status = 'accepted'
            invite.game_id = str(tournament.id)
            invite.save()
            tournament.participants.add(user)
            participant_count = tournament.participants.count()
            logger.info(f"User {user.user_name} joined tournament {tournament_id}, now {participant_count} participants")
            
            if participant_count == 4:
                tournament.status = 'in_progress'
                tournament.current_round = 'semifinals'
                tournament.save()
                logger.info(f"Tournament {tournament_id} reached 4 participants, preparing to start")
                return {'start': True, 'tournament': tournament}
            tournament.save()
            return {'success': True}
        except GameInvites.DoesNotExist:
            logger.error(f"Invalid or non-pending tournament invite {invite_id}")
            return {'error': 'Invalid or non-pending tournament invite'}
        except Tournament.DoesNotExist:
            logger.error(f"Tournament {tournament_id} not found")
            return {'error': 'Tournament not found'}

    async def handle_accept_tournament_invite(self, data):
        invite_id = data.get('invite_id')
        tournament_id = data.get('tournament_id')
        if not invite_id or not tournament_id:
            logger.error(f"Missing data: invite_id={invite_id}, tournament_id={tournament_id}")
            await self.send(text_data=json.dumps({'type': 'tournament_error', 'error': 'Missing invite_id or tournament_id'}))
            return
        
        result = await self.accept_tournament_invite(invite_id, self.user, tournament_id)
        logger.info(f"Accept tournament invite result: {result}")
        if 'error' in result:
            await self.send(text_data=json.dumps({'type': 'tournament_error', 'error': result['error']}))
            return
        
        tournament = await database_sync_to_async(Tournament.objects.get)(id=tournament_id)
        participants = await database_sync_to_async(lambda: list(tournament.participants.all()))()
        participant_count = len(participants)
        logger.info(f"Tournament {tournament_id} updated, now has {participant_count} participants: {[p.user_name for p in participants]}")
        
        for participant in participants:
            await self.channel_layer.group_send(
                f"friendship_group_{participant.id}",
                {'type': 'tournament_invite_accepted', 'tournament_id': tournament_id, 'invite_id': invite_id}
            )
        
        if result.get('start') and participant_count == 4:
            logger.info(f"Calling start_tournament for {tournament_id} with 4 participants")
            await self.start_tournament(tournament)
        elif participant_count < 4:
            logger.info(f"Tournament {tournament_id} waiting for more participants, currently {participant_count}/4")
            for participant in participants:
                await self.channel_layer.group_send(
                    f"friendship_group_{participant.id}",
                    {'type': 'tournament_waiting', 'tournament_id': tournament_id, 'participant_count': participant_count}
                )


    async def start_tournament(self, tournament):
        """Start a tournament by creating semifinals and waiting for them to finish before starting the final."""
        participants = await database_sync_to_async(lambda: list(tournament.participants.all()))()
        participant_count = len(participants)
        logger.info(f"Attempting to start tournament {tournament.id} with {participant_count} participants: {[p.user_name for p in participants]}")

        if participant_count != 4 or tournament.status != 'in_progress':
            logger.error(f"Blocked tournament {tournament.id} start: participant_count={participant_count}, status={tournament.status}")
            for participant in participants:
                await self.channel_layer.group_send(
                    f"friendship_group_{participant.id}",
                    {
                        'type': 'tournament_error',
                        'error': f'Tournament blocked: {participant_count}/4 participants, status={tournament.status}',
                        'tournament_id': tournament.id
                    }
                )
            return

        # Create semifinal matches -- blockchain
        logger.info(f"Pairing semifinals for tournament {tournament.id}: {participants[0].user_name} vs {participants[1].user_name}, {participants[2].user_name} vs {participants[3].user_name}")
        semi1 = await self.create_match(participants[0], participants[1], 'online', tournament)
        semi2 = await self.create_match(participants[2], participants[3], 'online', tournament)
        tournament.semifinal_1 = semi1
        tournament.semifinal_2 = semi2
        await database_sync_to_async(tournament.save)()

        # Use per-game locks for initializing semifinals
        semi1_lock = self.game_locks.setdefault(str(semi1.id), asyncio.Lock())
        semi2_lock = self.game_locks.setdefault(str(semi2.id), asyncio.Lock())
        
        async with semi1_lock:
            games[str(semi1.id)] = create_new_game(participants[0].user_name, participants[1].user_name, 'online')
        async with semi2_lock:
            games[str(semi2.id)] = create_new_game(participants[2].user_name, participants[3].user_name, 'online')

        # Notify participants to start semifinals
        logger.info(f"Tournament {tournament.id} started: Semi1 {semi1.id} ({participants[0].user_name} vs {participants[1].user_name}), Semi2 {semi2.id} ({participants[2].user_name} vs {participants[3].user_name})")
        for participant in participants:
            match_id = str(semi1.id) if participant in [participants[0], participants[1]] else str(semi2.id)
            player_1 = participants[0].user_name if participant in [participants[0], participants[1]] else participants[2].user_name
            player_2 = participants[1].user_name if participant in [participants[0], participants[1]] else participants[3].user_name
            await self.channel_layer.group_send(
                f"friendship_group_{participant.id}",
                {
                    'type': 'tournament_match_start',
                    'tournament_id': tournament.id,
                    'game_id': match_id,
                    'player_1': player_1,
                    'player_2': player_2
                }
            )

        # Start a background task to wait for semifinals to complete
        asyncio.create_task(self.wait_for_semifinals(tournament))

    async def wait_for_semifinals(self, tournament):
        """Wait for both semifinal matches to be done with a reasonable delay, then create and start the final match."""
        semi1_id = str(tournament.semifinal_1.id)
        semi2_id = str(tournament.semifinal_2.id)
        logger.info(f"Waiting for semifinals {semi1_id} and {semi2_id} to complete in tournament {tournament.id}")

        while True:
            # Check in-memory status with fallback to database
            semi1_done = games.get(semi1_id, {}).get('status', 'pending') == 'done'
            semi2_done = games.get(semi2_id, {}).get('status', 'pending') == 'done'

            # Database fallback to ensure accuracy
            if not (semi1_done and semi2_done):
                try:
                    semi1 = await database_sync_to_async(Match.objects.get)(id=semi1_id)
                    semi2 = await database_sync_to_async(Match.objects.get)(id=semi2_id)
                    semi1_done = semi1.match_status == Match.MatchStatusChoices.DONE
                    semi2_done = semi2.match_status == Match.MatchStatusChoices.DONE
                except Match.DoesNotExist as e:
                    logger.error(f"Semifinal match not found: {e}")
                    break

            if semi1_done and semi2_done:
                logger.info(f"Both semifinals {semi1_id} and {semi2_id} are done for tournament {tournament.id}")
                break

            logger.debug(f"Semifinals status: semi1_done={semi1_done}, semi2_done={semi2_done}, waiting 15 seconds before next check")
            await asyncio.sleep(10)  # Matches comment

        # Fetch semifinal objects and their winners
        try:
            semi1 = await database_sync_to_async(Match.objects.select_related('match_winner', 'match_loser').get)(id=semi1_id)
            semi2 = await database_sync_to_async(Match.objects.select_related('match_winner', 'match_loser').get)(id=semi2_id)
        except Match.DoesNotExist as e:
            logger.error(f"Failed to fetch semifinals: {e}")
            return

        winner1 = await self.get_match_winner(semi1)
        winner2 = await self.get_match_winner(semi2)

        if not winner1 or not winner2:
            logger.error(f"Missing winners for semifinals in tournament {tournament.id}: semi1_winner={winner1}, semi2_winner={winner2}")
            participants = await database_sync_to_async(lambda: list(tournament.participants.all()))()
            for participant in participants:
                await self.channel_layer.group_send(
                    f"friendship_group_{participant.id}",
                    {
                        'type': 'tournament_error',
                        'error': 'Failed to determine semifinal winners',
                        'tournament_id': str(tournament.id)  # Ensure string for consistency
                    }
                )
            return

        # Create the final match
        logger.info(f"Creating final match for tournament {tournament.id}: {winner1.user_name} vs {winner2.user_name}")
        final_match = await self.create_match(winner1, winner2, 'online', tournament)

        # Update tournament synchronously to avoid async context issues
        def sync_update_tournament():
            tournament.current_round = 'final'
            tournament.final = final_match
            tournament.save()

        try:
            await database_sync_to_async(sync_update_tournament)()
        except Exception as e:
            logger.error(f"Failed to update tournament {tournament.id}: {e}")
            return

        # Initialize the final game state
        final_lock = self.game_locks.setdefault(str(final_match.id), asyncio.Lock())
        async with final_lock:
            games[str(final_match.id)] = create_new_game(winner1.user_name, winner2.user_name, 'online')

        # Notify participants to start the final
        participants = await database_sync_to_async(lambda: list(tournament.participants.all()))()
        logger.info(f"Tournament {tournament.id} final started: {final_match.id} ({winner1.user_name} vs {winner2.user_name})")
        for participant in participants:
            await self.channel_layer.group_send(
                f"friendship_group_{participant.id}",
                {
                    'type': 'tournament_match_start',
                    'tournament_id': str(tournament.id),
                    'game_id': str(final_match.id),
                    'player_1': winner1.user_name,
                    'player_2': winner2.user_name
                }
            )

    @database_sync_to_async
    def get_match_winner(self, match):
        """Safely retrieve the match winner, handling potential missing or uncached values."""
        try:
            return match.match_winner
        except AttributeError:
            logger.error(f"Match {match.id} has no winner set")
            return None
        except Exception as e:
            logger.error(f"Error retrieving winner for match {match.id}: {e}")
            return None



    @database_sync_to_async
    def create_match(self, player_1, player_2, game_opponent, tournament):
        match = Match.objects.create(
            match_name=f"{player_1.user_name} vs {player_2.user_name}",
            player_1=player_1,
            player_2=player_2,
            game_opponent=game_opponent
        )
        logger.info(f"Created match {match.id} for {player_1.user_name} vs {player_2.user_name} in tournament {tournament.id}")
        return match


    async def handle_match_result(self, data):
        """Process match results and complete the tournament if final is done."""
        game_id = data.get('game_id')
        winner_username = data.get('winner')
        tournament_id = data.get('tournament_id')
        if not all([game_id, winner_username, tournament_id]):
            logger.error(f"Missing data in report_match_result: game_id={game_id}, winner={winner_username}, tournament_id={tournament_id}")
            await self.send_error('match_result_error', 'Missing game_id, winner, or tournament_id')
            return

        logger.info(f"Received report_match_result: game_id={game_id}, winner={winner_username}, tournament_id={tournament_id}")
        result = await self.process_match_result(game_id, winner_username, tournament_id)

        if not result:
            logger.error(f"Failed to process match result for game {game_id}")
            return

        tournament = await database_sync_to_async(Tournament.objects.get)(id=tournament_id)
        participants = await database_sync_to_async(lambda: list(tournament.participants.all()))()

        if result.get('completed'):
            for participant in participants:
                await self.channel_layer.group_send(
                    f"friendship_group_{participant.id}",
                    {
                        'type': 'tournament_completed',
                        'tournament_id': tournament_id,
                        'champion': result['champion']
                    }
                )
        # No 'next_match' case since wait_for_semifinals handles the final creation

    @database_sync_to_async
    def process_match_result(self, game_id, winner_username, tournament_id):
        """Process match result, only completing the tournament if it’s the final."""
        try:
            match = Match.objects.get(id=game_id)
            winner = Users.objects.get(user_name=winner_username)
            match.match_winner = winner
            match.save()

            tournament = Tournament.objects.get(id=tournament_id)
            logger.info(f"Processing match {game_id} in tournament {tournament.id}, round={tournament.current_round}")

            if tournament.current_round == 'final' and match == tournament.final:
                tournament.status = 'completed'
                tournament.champion = winner
                tournament.completion_date = datetime.utcnow()
                tournament.save()
                logger.info(f"Tournament {tournament.id} completed, champion: {winner.user_name}")
                return {'completed': True, 'champion': winner.user_name}
            elif tournament.current_round == 'semifinals':
                logger.info(f"Semifinal {game_id} completed, waiting for other semifinal in tournament {tournament.id}")
                return {'waiting': True}
            return {'waiting': True}
        except Match.DoesNotExist:
            logger.error(f"Match {game_id} not found")
            return None
        except Users.DoesNotExist:
            logger.error(f"Winner {winner_username} not found")
            return None
        except Tournament.DoesNotExist:
            logger.error(f"Tournament {tournament_id} not found")
            return None

    async def friend_request_accepted_notification(self, event):
        await self.send(text_data=json.dumps({
            'type': 'friend_request_accepted_notification',
            'request_id': event['request_id'],
            'from_user_id': event['from_user_id'],
            'from_username': event['from_username']
        }))

    async def new_friend_request_notification(self, event):
        await self.send(text_data=json.dumps({
            'type': 'new_friend_request_notification',
            'request_id': event['request_id'],
            'from_user_id': event['from_user_id'],
            'from_username': event['from_username']
        }))

    async def friend_request_rejected_notification(self, event):
        await self.send(text_data=json.dumps({
            'type': 'friend_request_rejected_notification',
            'from_user_id': event['from_user_id'],
            'from_username': event['from_username']
        }))

    async def new_game_invite_notification(self, event):
        await self.send(text_data=json.dumps({
            'type': 'new_game_invite_notification',
            'invite_id': event['invite_id'],
            'from_user_id': event['from_user_id'],
            'from_username': event['from_username'],
            'game_mode': event['game_mode'],
            'tournament_id': event.get('tournament_id')
        }))

    async def game_invite_accepted_notification(self, event):
        await self.send(text_data=json.dumps({
            'type': 'game_invite_accepted_notification',
            'invite_id': event['invite_id'],
            'game_id': event['game_id'],
            'to_username': event['to_username']
        }))

    async def game_invite_rejected_notification(self, event):
        await self.send(text_data=json.dumps({
            'type': 'game_invite_rejected_notification',
            'invite_id': event['invite_id'],
            'from_username': event['from_username']
        }))

    async def tournament_invite_accepted(self, event):
        await self.send(text_data=json.dumps(event))

    async def tournament_match_start(self, event):
        await self.send(text_data=json.dumps(event))

    async def tournament_completed(self, event):
        await self.send(text_data=json.dumps(event))

    async def tournament_waiting(self, event):
        await self.send(text_data=json.dumps({
            'type': 'tournament_waiting',
            'tournament_id': event['tournament_id'],
            'participant_count': event['participant_count']
        }))

    async def tournament_error(self, event):
        """Handle tournament error notifications."""
        await self.send(text_data=json.dumps({
            'type': 'tournament_error',
            'error': event['error'],
            'tournament_id': event.get('tournament_id')  # Optional, only included in some cases
        }))