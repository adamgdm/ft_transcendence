from django.urls import path
from . import views

urlpatterns = [
    path('create_game/', views.create_game, name='create_game'),
    path('send_game_invite/', views.send_game_invite, name='send_game_invite'),
    path('cancel_game_invite/', views.cancel_game_invite, name='cancel_game_invite'),
    path('accept_game_invite/', views.accept_game_invite, name='accept_game_invite'),
    path('reject_game_invite/', views.reject_game_invite, name='reject_game_invite'),
    path('get_game_invites_received/', views.get_game_invites_received, name='get_game_invites_received'),
    path('get_game_invites_sent/', views.get_game_invites_sent, name='get_game_invites_sent'),
    path('get_game_invite_status/', views.get_game_invite_status, name='get_game_invite_status'),
    path('bulk_game_invite_status/', views.bulk_game_invite_status, name='bulk_game_invite_status'),
    path('accept_game_invite_from_user/', views.accept_game_invite_from_user, name='accept_game_invite_from_user'),
]