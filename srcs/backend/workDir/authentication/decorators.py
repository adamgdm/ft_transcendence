from .utils import generate_jwt_token, decode_jwt_token, verify_jwt_token
from functools import wraps
from django.conf import settings
from django.http import JsonResponse
from datetime import datetime, timedelta
from .models import BlacklistedTokens, Users, LoggedOutTokens

def check_auth(func):
    @wraps(func)
    def checking_jwt(request, *args, **kwargs):
        token = request.headers.get('Authorization')
        if token is None:
            return JsonResponse({'error': 'Token is missing'}, status=401)
        
        if token.startswith('Bearer '):
            token = token.split(' ')[1]

        payload = decode_jwt_token(token)
        if payload is None:
            return JsonResponse({'error': 'Token is invalid'}, status=401)
        
        exp = datetime.utcfromtimestamp(payload['exp'])
        remaining_time = exp - datetime.utcnow()

        # Check if token has expired
        if remaining_time <= timedelta(seconds=0):
            return JsonResponse({'error': 'Token has expired'}, status=401)
        
        # Check if token is blacklisted
        if BlacklistedTokens.objects.filter(token=token).exists():
            return JsonResponse({'error': 'Token is blacklisted'}, status=401)
        
        # Check if user is Logged out
        if LoggedOutTokens.objects.filter(token=token).exists():
            return JsonResponse({'error': 'Token is invalid'}, status=401)

        request.user_id = payload['user_id']

        # update online status
        user = Users.objects.get(id=payload['user_id'])
        user.online_status = datetime.utcnow() + timedelta(minutes=2)
        user.save()

        if remaining_time <= timedelta(seconds=150):
            BlacklistedTokens.objects.create(token=token)
            new_token = generate_jwt_token(user)
            request.META['HTTP_AUTHORIZATION'] = f'Bearer {new_token}'
            response = func(request, *args, **kwargs)
            response['Authorization'] = f'Bearer {new_token}'
            return response
        return func(request, *args, **kwargs)
    return checking_jwt
            