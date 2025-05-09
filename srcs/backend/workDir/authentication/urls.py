from django.urls import path
from . import views

urlpatterns = [
    path('register/', views.register, name='register'),
    path('send_otp_pass/', views.send_otp_pass, name='send_otp_pass'),
    path('send_otp_email_change/', views.send_otp_email_change, name='send_otp_email_change'),
    path('forgot_password/', views.forgot_password, name='forgot_password'),
    path('delete_account/', views.delete_account, name='delete_account'),
    path('another_user_profile/', views.another_user_profile, name='another_user_profile'),
    path('verify_email/', views.verify_email, name='verify_email'),
    path('login/', views.login, name='login'),
    path('login_otp/', views.login_otp, name='login_otp'),
    path('oauth42/', views.oauth2, name='oauth2'),
    path('oauth2/login/', views.oauth2_login, name='oauth2_login'),
    path('oauth2/login/redirect/', views.oauth2_login_redirect, name='oauth2_login_redirect'),
    path('enable_2fa/', views.enable_2fa, name='enable_2fa'),
    path('disable_2fa/', views.disable_2fa, name='disable_2fa'),
    path('profile/', views.profile, name='profile'),
    path('add_pfp/', views.add_profile_picture, name='add_profile_picture'),
    path('del_pfp/', views.delete_profile_picture, name='delete_profile_picture'),
    path('verifyToken/', views.verifyToken, name='verifyToken'),
    path('another_user_profile/', views.another_user_profile, name='another_user_profile'),
    path('modify_username/', views.modify_username, name='modify_username'),
    path('modify_firstname/', views.modify_firstname, name='modify_firstname'),
    path('modify_lastname/', views.modify_lastname, name='modify_lastname'),
    path('modify_bio/', views.modify_bio, name='modify_bio'),
    path('modify_email/', views.modify_email, name='modify_email'),
    path('modify_password/', views.modify_password, name='modify_password'),
    path('logout/', views.logout, name='logout'),
    path('update_profile/', views.update_profile, name='update_profile'),
    path('check_settings_password/', views.check_settings_password, name='check_settings_password'),
    # Friendships
    path('add_friend/', views.add_friend, name='add_friend'),
    path('cancel_invite/', views.cancel_invite, name='cancel_invite'),
    path('remove_friend/', views.remove_friend, name='remove_friend'),
    path('get_friends/', views.get_friends, name='get_friends'),
    path('accept_friend/', views.accept_friend, name='accept_friend'),
    path('reject_friend/', views.reject_friend, name='reject_friend'),
    path('get_friend_requests/', views.get_friend_requests, name='get_friend_requests'),
    path('get_sent_friend_requests/', views.get_sent_friend_requests, name='get_sent_friend_requests'),
    path('get_friendship_status/', views.get_friendship_status, name='get_friendship_status'),
    path('bulk_friend_status/', views.bulk_friend_status, name='bulk_friend_status'),
    # Search
    path('search_users/', views.search_users, name='search_users'),
]