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
        # Get all pending friend requests where this user is the recipient
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
        # Authenticate user
        self.user, result = await self.check_wsAuth()
        if self.user is None:
            print(f"Authentication failed: {result}")
            await self.close()
            return
        
        # Set up group name using user ID
        self.group_name = f"friendship_group_{self.user.id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        
        await self.accept()

        # Send existing pending friend requests immediately after connection
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

        # Create the friend request
        friendship = await self.create_friend_request(self.user.id, friend_username)
        if friendship:
            # Notify the recipient (to_user) about the new friend request
            await self.channel_layer.group_send(
                f"friendship_group_{friendship.to_user.id}",
                {
                    'type': 'new_friend_request_notification',
                    'request_id': friendship.id,
                    'from_user_id': self.user.id,
                    'from_username': self.user.user_name
                }
            )

    @database_sync_to_async
    def create_friend_request(self, from_user_id, to_user_username):
        try:
            from_user = Users.objects.get(id=from_user_id)
            to_user = Users.objects.get(user_name=to_user_username)

            # Create the friendship object
            friendship = Friendship.objects.create(
                from_user=from_user,
                to_user=to_user,
                friendship_status=Friendship.Status.PENDING
            )
            return friendship
        except Users.DoesNotExist:
            logger.error(f"User not found: from_user_id={from_user_id}, to_user_id={to_user_id}")
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

        # Accept the friend request
        success = await self.process_friend_request(friend_username, Friendship.Status.ACCEPTED)
        if success:
            # Notify the sender (from_user) that their request was accepted
            await self.channel_layer.group_send(
                f"friendship_group_{success.from_user.id}",
                {
                    'type': 'friend_request_accepted_notification',
                    'request_id': success.id,
                    'from_user_id': self.user.id,
                    'from_username': self.user.user_name
                }
            )

            # Acknowledge the acceptance to the current user
            await self.send(text_data=json.dumps({
                'type': 'friend_request_accepted',
                'friend_username': friend_username,
                'message': 'Friend request accepted successfully'
            }))
        else:
            await self.send(text_data=json.dumps({
                'type': 'friend_request_error',
                'friend_username': friend_username,
                'error': 'Failed to accept friend request'
            }))

    async def handle_reject_friend_request(self, data):
        friend_username = data.get('friend_username')
        if not friend_username:
            logger.error("Missing friend_username in accept_friend_request")
            await self.send(text_data=json.dumps({
                'type': 'friend_request_error',
                'error': 'Missing friend_username'
            }))
            return

        # Process the friend request rejection
        friendship = await self.process_friend_request(friend_username, Friendship.Status.REJECTED)
        if friendship:
            await self.send(text_data=json.dumps({
                'type': 'friend_request_rejected',
                'request_id': request_id
            }))
        
        else:
            await self.send(text_data=json.dumps({
                'type': 'friend_request_error',
                'friend_username': friend_username,
                'error': 'Failed to reject friend request'
            }))

    @database_sync_to_async
    def process_friend_request(self, friend_username, status):
        try:
            friendship = Friendship.objects.get(
                from_user__user_name=friend_username,
                to_user=self.user,
                friendship_status=Friendship.Status.PENDING
            )
            friendship.friendship_status = status
            friendship.save()
            return friendship
        except Friendship.DoesNotExist:
            logger.error(f"Friend request not found: {request_id}")
            return None


    async def friend_request_accepted_notification(self, event):
        """
        Handles the 'friend_request_accepted_notification' message sent to the group.
        Forwards the message to the WebSocket connection.
        """
        await self.send(text_data=json.dumps({
            'type': 'friend_request_accepted_notification',
            'request_id': event['request_id'],
            'from_user_id': event['from_user_id'],
            'from_username': event['from_username']
        }))

    async def new_friend_request_notification(self, event):
        """
        Handles the 'new_friend_request_notification' message sent to the group.
        Forwards the message to the WebSocket connection.
        """
        await self.send(text_data=json.dumps({
            'type': 'new_friend_request_notification',
            'request_id': event['request_id'],
            'from_user_id': event['from_user_id'],
            'from_username': event['from_username']
        }))


    # Update your send_notification function to work with channels
    async def send_notification(user, message, from_user=None):
        group_name = f"friendship_group_{user.id}"
        event = {
            'type': 'friend_update_notification',
            'message': message,
            'friend_id': from_user.id if from_user else None
        }
        
        if from_user:
            event = {
                'type': 'friend_request_notification',
                'message': message,
                'from_user_id': from_user.id,
                'from_username': from_user.user_name
            }

        from channels.layers import get_channel_layer
        channel_layer = get_channel_layer()
        await channel_layer.group_send(group_name, event)