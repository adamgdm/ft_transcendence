import json
import asyncio
from datetime import datetime, timedelta
from django.conf import settings
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from authentication.utils import decode_jwt_token
from authentication.models import BlacklistedTokens, LoggedOutTokens, Users
from gameBackend.models import GameInvites, Match
from django.db.models import Q
from .models import Friendship
import logging

logger = logging.getLogger(__name__)

# Import games and create_new_game (assuming they're defined in gameBackend.views)
from gameBackend.views import games, create_new_game
# Define games_lock if not already imported or defined elsewhere
games_lock = asyncio.Lock()

class FriendshipConsumer(AsyncWebsocketConsumer):
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

        # Send pending friend requests
        pending_friend_requests = await self.get_pending_friend_requests(self.user)
        if pending_friend_requests:
            await self.send(text_data=json.dumps({
                'type': 'pending_friend_requests',
                'requests': pending_friend_requests
            }))

        # Send pending game invites
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
        self.user.online_status = datetime.utcnow()
        self.user.save()

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            message_type = data.get('type')

            # Friendship-related handlers
            if message_type == "send_friend_request":
                await self.handle_send_friend_request(data)
            elif message_type == "accept_friend_request":
                await self.handle_accept_friend_request(data)
            elif message_type == "reject_friend_request":
                await self.handle_reject_friend_request(data)
            elif message_type == "cancel_friend_request":
                await self.handle_cancel_friend_request(data)
            # Game-related handlers
            elif message_type == "send_game_invite":
                await self.handle_send_game_invite(data)
            elif message_type == "accept_game_invite":
                await self.handle_accept_game_invite(data)
            elif message_type == "reject_game_invite":
                await self.handle_reject_game_invite(data)
            else:
                logger.warning(f"Unknown message type: {message_type}")
        except json.JSONDecodeError:
            logger.error("Invalid JSON data received")

    # Friendship Handlers (unchanged)
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
        if result and 'game_id' in result and 'from_user_id' in result and 'from_username' in result:
            game_id = result['game_id']
            from_user_id = result['from_user_id']
            from_username = result['from_username']
            to_username = self.user.user_name

            # Create the game state in the games dictionary
            async with games_lock:
                if game_id not in games:
                    games[game_id] = create_new_game(to_username, from_username, 'online')

            # Notify both players
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
        else:
            error_message = result.get('error', 'Failed to accept game invite') if result else 'Invalid response from accept_game_invite'
            await self.send(text_data=json.dumps({
                'type': 'game_invite_error',
                'invite_id': invite_id,
                'error': error_message
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
        if not to_username:
            await self.send(text_data=json.dumps({
                'type': 'game_invite_error',
                'error': 'Missing to_username'
            }))
            return

        if game_mode not in GameInvites.GameModes.values:
            await self.send(text_data=json.dumps({
                'type': 'game_invite_error',
                'error': 'Invalid game mode'
            }))
            return

        invite = await self.create_game_invite(self.user.id, to_username, game_mode)
        if invite:
            await self.channel_layer.group_send(
                f"friendship_group_{invite.to_user.id}",
                {
                    'type': 'new_game_invite_notification',
                    'invite_id': invite.id,
                    'from_user_id': self.user.id,
                    'from_username': self.user.user_name,
                    'game_mode': game_mode
                }
            )
            await self.send(text_data=json.dumps({
                'type': 'game_invite_sent',
                'to_username': to_username,
                'invite_id': invite.id,
                'message': 'Game invite sent successfully'
            }))
        else:
            await self.send(text_data=json.dumps({
                'type': 'game_invite_error',
                'to_username': to_username,
                'error': 'Failed to send game invite (user not found or invite exists)'
            }))

    @database_sync_to_async
    def accept_game_invite(self, invite_id, user):
        try:
            invite = GameInvites.objects.get(
                id=invite_id,
                to_user=user,
                status=GameInvites.GameInviteStatus.PENDING
            )
            from_user = invite.from_user
            game_name = f"{from_user.user_name} vs {user.user_name}"
            game = Match.objects.create(
                match_name=game_name,
                player_1=user,  # Acceptor
                player_2=from_user,  # Inviter
                game_opponent='online'
            )
            invite.status = GameInvites.GameInviteStatus.ACCEPTED
            invite.game_id = str(game.id)
            invite.save()
            return {
                'game_id': str(game.id),
                'from_user_id': from_user.id,
                'from_username': from_user.user_name  # Added from_username
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

    # Database Methods (unchanged)
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
    def create_game_invite(self, from_user_id, to_username, game_mode):
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
                status=GameInvites.GameInviteStatus.PENDING
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

    # Notification Handlers (unchanged)
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
            'game_mode': event['game_mode']
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