from django.urls import path
from . import views

urlpatterns = [
    path('register/', views.register, name='register'),
    path('login/', views.login, name='login'),
    path('login_otp/', views.login_otp, name='login_otp'),
    path('enable_2fa/', views.enable_2fa, name='enable_2fa'),
    path('profile/', views.profile, name='profile')
]
