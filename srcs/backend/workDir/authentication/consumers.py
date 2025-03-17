import json
import asyncio
from datetime import datetime, timedelta
from django.conf import settings
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from authentication.utils import decode_jwt_token
from authentication.models import BlacklistedTokens, LoggedOutTokens, Users
from django.db.models import Q
from .models import Friendship
import logging

logger = logging.getLogger(__name__)

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

    async def connect(self):
        self.user, result = await self.check_wsAuth()
        if self.user is None:
            logger.info(f"Authentication failed: {result}")
            await self.close()
            return
        
        self.group_name = f"friendship_group_{self.user.id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        
        await self.accept()

        pending_requests = await self.get_pending_friend_requests(self.user)
        if pending_requests:
            await self.send(text_data=json.dumps({
                'type': 'pending_friend_requests',
                'requests': pending_requests
            }))

    async def disconnect(self, close_code):
        # Remove user from the group
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

        # Update user's online status
        await self.update_user_online_status()

    @database_sync_to_async
    def update_user_online_status(self):
        self.user.online_status = datetime.utcnow()
        self.user.save()

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

    async def handle_reject_friend_request(self, data):
        friend_username = data.get('friend_username')
        if not friend_username:
            logger.error("Missing friend_username in reject_friend_request")
            await self.send(text_data=json.dumps({
                'type': 'friend_request_error',
                'error': 'Missing friend_username'
            }))
            return

        success = await self.process_friend_request(friend_username, Friendship.Status.REJECTED)
        if success is not False:  # Success is True if deleted
            await self.send(text_data=json.dumps({
                'type': 'friend_request_rejected',
                'friend_username': friend_username,
                'message': 'Friend request rejected and deleted successfully'
            }))
            # Optionally notify the sender that their request was rejected
            try:
                from_user = await database_sync_to_async(Users.objects.get)(user_name=friend_username)
                await self.channel_layer.group_send(
                    f"friendship_group_{from_user.id}",
                    {
                        'type': 'friend_request_rejected_notification',
                        'from_user_id': self.user.id,
                        'from_username': self.user.user_name
                    }
                )
            except Users.DoesNotExist:
                logger.error(f"Could not notify {friend_username} of rejection: user not found")
        else:
            await self.send(text_data=json.dumps({
                'type': 'friend_request_error',
                'friend_username': friend_username,
                'error': 'No pending friend request found from this user'
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
                return True  # Indicate successful deletion
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
