from .utils import generate_jwt_token, decode_jwt_token, verify_jwt_token
from functools import wraps
from django.conf import settings
from django.http import JsonResponse
from datetime import datetime, timedelta
from .models import BlacklistedTokens, Users, LoggedOutTokens

def check_auth(func):
    @wraps(func)
    def checking_jwt(request, *args, **kwargs):
        token = request.COOKIES.get('token')
        if token is None:
            return JsonResponse({'error': 'Token is missing'}, status=401)

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
        request.token = token

        # update online status
        user = Users.objects.get(id=payload['user_id'])
        user.save()

        if remaining_time <= timedelta(seconds=150):
            BlacklistedTokens.objects.create(token=token)
            new_token = generate_jwt_token(user)
            # Instead of modifying headers, prepare the response with new cookie
            response = func(request, *args, **kwargs)
            # Set new token in cookies
            response.set_cookie(
                'token',
                new_token,
                httponly=True,
                secure=getattr(settings, 'SESSION_COOKIE_SECURE', False),
                samesite='None',
                max_age=601
            )
            return response
        return func(request, *args, **kwargs)
    return checking_jwt