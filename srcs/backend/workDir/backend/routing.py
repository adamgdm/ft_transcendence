from django.urls import re_path
from gameBackend.consumers import PongConsumer
from authentication.consumers import FriendshipConsumer

websocket_urlpatterns = [
    re_path(r'ws/pong/(?P<game_id>\w+)/$', PongConsumer.as_asgi()),
    re_path(r'ws/friendship/$', FriendshipConsumer.as_asgi()),
]