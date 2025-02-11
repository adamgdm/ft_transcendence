from django.urls import path
from . import views

urlpatterns = [
    path('create_game/', views.create_game, name='create_game'),
    path('game/', views.game_render, name='game_render'),
    path('get_game_state/', views.get_game_state, name='get_game_state'),
    path('game_action/', views.game_action, name='game_action'),
]