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

class FriendshipConsumer(AsyncWebsocketConsumer):
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
            return user, "Success"
        except Users.DoesNotExist:
            return None, "User not found"

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
        self.user, result = await self.check_wsAuth(self.scope)
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
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            message_type = data.get('type')

            if message_type == 'ping':
                await self.send(text_data=json.dumps({
                    'type': 'pong'
                }))
                
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Invalid JSON format'
            }))

    # Handler for friend request notifications
    async def friend_request_notification(self, event):
        await self.send(text_data=json.dumps({
            'type': 'friend_request',
            'message': event['message'],
            'from_user_id': event['from_user_id'],
            'from_username': event['from_username']
        }))

    # Handler for friend request updates (accept/reject/cancel/remove)
    async def friend_update_notification(self, event):
        await self.send(text_data=json.dumps({
            'type': 'friend_update',
            'message': event['message'],
            'friend_id': event['friend_id']
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