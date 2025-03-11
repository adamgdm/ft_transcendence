from django.urls import re_path
from gameBackend.consumers import PongConsumer

websocket_urlpatterns = [
    re_path(r'ws/pong/(?P<game_id>\w+)/(?P<user_id>\w+)/$', PongConsumer.as_asgi()),
]