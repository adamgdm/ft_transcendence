from django.urls import path
from . import views

urlpatterns = [
    path('register/', views.register, name='register'),
    path('login/', views.login, name='login'),
    path('login_otp/', views.login_otp, name='login_otp'),
    path('enable_2fa/', views.enable_2fa, name='enable_2fa'),
    path('disable_2fa/', views.disable_2fa, name='disable_2fa'),
    path('profile/', views.profile, name='profile'),
    path('add_pfp/', views.add_profile_picture, name='add_profile_picture'),
    path('modify_username/', views.modify_username, name='modify_username'),
    path('modify_firstname/', views.modify_firstname, name='modify_firstname'),
    path('modify_lastname/', views.modify_lastname, name='modify_lastname'),
    path('modify_bio/', views.modify_bio, name='modify_bio'),
    path('modify_email/', views.modify_email, name='modify_email'),
    path('modify_password/', views.modify_password, name='modify_password'),
    path('logout/', views.logout, name='logout'),
    # Friendships
    path('add_friend/', views.add_friend, name='add_friend'),
    path('remove_friend/', views.remove_friend, name='remove_friend'),
    path('get_friends/', views.get_friends, name='get_friends'),
    path('accept_friend/', views.accept_friend, name='accept_friend'),
    path('reject_friend/', views.reject_friend, name='reject_friend'),
    path('get_friend_requests/', views.get_friend_requests, name='get_friend_requests'),
]