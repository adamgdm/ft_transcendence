from django.shortcuts import render
from django.core.validators import EmailValidator
from django.core.exceptions import ValidationError
from .models import Users
from django.contrib.auth.hashers import make_password
from .utils import UsernameValidator, PasswordValidator, NameValidator, generate_jwt_token, decode_jwt_token, verify_jwt_token, send_2fa_email, send_2fa_email_verification
from django.http import JsonResponse
from django.db.models import Q
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.hashers import check_password
from .decorators import check_auth
from datetime import datetime, timedelta
from django.utils import timezone
from django.conf import settings
from .models import BlacklistedTokens, LoggedOutTokens, Friendship
import json
import random

# Register function
@csrf_exempt
def register(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'could not fetch data'}, status=400)
        user_name = data.get('user_name')
        email = data.get('email')
        password = data.get('password')
        first_name = data.get('first_name')
        last_name = data.get('last_name')
        if not all ([user_name, email, password, first_name, last_name]):
            return JsonResponse({'error': 'Missing fields'}, status=400)
        email_validator = EmailValidator()
        try:
            email_validator(email)
        except ValidationError:
            return JsonResponse({'error': 'Invalid email format'}, status=400)
        if not UsernameValidator(user_name):
            return JsonResponse({'error': 'Invalid username'}, status=400)
        if not PasswordValidator(password):
            return JsonResponse({'error': 'Invalid password'}, status=400)
        if Users.objects.filter(email=email).exists():
            return JsonResponse({'error': 'User with this email already exists'}, status=400)
        if Users.objects.filter(user_name=user_name).exists():
            return JsonResponse({'error': 'User with this username already exists'}, status=400)
        if (not NameValidator(first_name) or not NameValidator(last_name)):
            return JsonResponse({'error': 'Invalid Name'}, status=400)
        hash_pass = make_password(password)
        try:
            user = Users.objects.create(
                user_name=user_name,
                first_name=first_name,
                last_name=last_name,
                email=email,
                password_hash=hash_pass,
                otp_password = random.randint(100000, 999999),
                otp_expiry = timezone.now() + timedelta(minutes=5),
            )
        except Exception as e: 
            return JsonResponse({'error': f'An error occured: {e}'}, status=500)
        
        # Send email verification
        if send_2fa_email_verification(email, user.otp_password):
            return JsonResponse({'error': 'Could not send Verification Email'}, status=500)
        return JsonResponse({'message': 'User registered successfully'}, status=201)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
def verify_email(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Invalid request method'}, status=405)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Could not fetch data'}, status=400)

    email = data.get('email', '').strip()
    otp_password = str(data.get('code', '')).strip()  # Ensure OTP is treated as a string

    if not email or not otp_password:
        return JsonResponse({'error': 'Missing fields'}, status=400)

    try:
        user = Users.objects.get(email=email)
    except Users.DoesNotExist:
        return JsonResponse({'error': 'No user found with the email entered'}, status=400)

    stored_otp = str(user.otp_password).strip() if user.otp_password else None  # Ensure stored OTP is a string

    if not stored_otp:
        return JsonResponse({'error': 'Verification code not generated'}, status=400)

    if stored_otp != otp_password:
        return JsonResponse({'error': 'Invalid code'}, status=400)

    if user.otp_expiry and user.otp_expiry < timezone.now():
        return JsonResponse({'error': 'Code expired'}, status=400)

    user.email_verified = True
    user.otp_password = ''
    user.otp_expiry = None
    user.save()

    return JsonResponse({'message': 'Email verified successfully'}, status=200)

# Login function
@csrf_exempt
def login(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'could not fetch data'}, status=400)
        login_cred = data.get('login')
        password = data.get('password')
        if not all([login_cred, password]):
            return JsonResponse({'error': 'Missing fields'}, status=400)
        user = Users.objects.filter(Q(email=login_cred) | Q(user_name=login_cred)).first()
        if not user:
            return JsonResponse({'error': 'No user found with the username or email entered'}, status=400)
        if not check_password(password, user.password_hash):
            return JsonResponse({'error': 'Incorrect password'}, status=400)
        else:
            if user.two_factor_enabled:
                user.otp_password = random.randint(100000, 999999)
                user.otp_expiry = timezone.now() + timedelta(minutes=5)
                user.save()
                email = user.email
                otp = user.otp_password
                if not send_2fa_email(email, otp):
                    return JsonResponse({'error': 'Could not send OTP'}, status=500)
                return JsonResponse({'message': 'Two factor authentication enabled'}, status=200)
        jwt_token = generate_jwt_token(user)
        user.last_login = timezone.now()
        user.save()
        response = JsonResponse({
            'message': 'Login successful'
            }, status=200)
        response.set_cookie(
            'token',
            jwt_token,
            httponly=True,
            secure=getattr(settings, 'SESSION_COOKIE_SECURE', False),
            samesite='Lax',
            max_age=601
        )
        return response

    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
def login_otp(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'could not fetch data'}, status=400)
        login_cred = data.get('login')
        otp = data.get('otp')
        if not all([login_cred, otp]):
            return JsonResponse({'error': 'Missing fields'}, status=400)
        user = Users.objects.filter(Q(email=login_cred) | Q(user_name=login_cred)).first()
        if not user:
            return JsonResponse({'error': 'No user found with the username or email entered'}, status=400)
        if not user.two_factor_enabled:
            return JsonResponse({'error': 'Two factor authentication not enabled'}, status=400)
        if not user.otp_password:
            return JsonResponse({'error': 'OTP not generated'}, status=400)
        if user.otp_password != otp:
            return JsonResponse({'error': 'Invalid OTP'}, status=400)
        if user.otp_expiry < timezone.now():
            return JsonResponse({'error': 'OTP expired'}, status=400)
        user.otp_password = ''
        user.otp_expiry = None
        user.last_login = timezone.now()
        user.save()
        jwt_token = generate_jwt_token(user)
        response = JsonResponse({
            'message': 'Login successful',
            }, status=200)
        response.set_cookie(
            'token',
            jwt_token,
            httponly=True,
            secure=getattr(settings, 'SESSION_COOKIE_SECURE', False),
            samesite='Lax',
            max_age=601
        )
        return response
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
def enable_2fa(request):
    if request.method == 'POST':
        token = request.COOKIES.get('token')
        if not token:
            return JsonResponse({'error': 'Token is missing'}, status=401)
        user_id = verify_jwt_token(token)
        if not user_id:
            return JsonResponse({'error': 'Invalid token'}, status=401)
        try:
            user = Users.objects.get(id=user_id)
        except Users.DoesNotExist:
            return JsonResponse({'error': 'User not found'}, status=404)
        
        if user.two_factor_enabled:
            return JsonResponse({'error': 'Two factor authentication already enabled'}, status=400)
        
        user.two_factor_enabled = True
        user.save()
        return JsonResponse({'message': 'Two factor authentication enabled'}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
def disable_2fa(request):
    if request.method == 'POST':
        # get token from cookie 
        token = request.COOKIES.get('token')
        if not token:
            return JsonResponse({'error': 'Token is missing'}, status=401)
        user_id = verify_jwt_token(token)
        if not user_id:
            return JsonResponse({'error': 'Invalid token'}, status=401)
        
        try:
            user = Users.objects.get(id=user_id)
        except Users.DoesNotExist:
            return JsonResponse({'error': 'User not found'}, status=404)
        
        if not user.two_factor_enabled:
            return JsonResponse({'error': 'Two factor authentication not enabled'}, status=400)
        
        user.two_factor_enabled = False
        user.save()
        return JsonResponse({'message': 'Two factor authentication disabled'}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@check_auth
def profile(request):
    if request.method == 'GET':
        user = Users.objects.get(id=request.user_id)
        return JsonResponse({
            'user_name': user.user_name,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'email': user.email,
            'bio_description': user.bio_description,
            'profile_picture_url': user.profile_picture_url.url if user.profile_picture_url else None,
            'account_status': user.account_status,
            'two_factor_enabled': user.two_factor_enabled,
            'registration_date': user.registration_date,
            'online_status': user.online_status,
            'last_login': user.last_login,
            'last_password_change': user.last_password_change
        }, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
@check_auth
def add_profile_picture(request):
    if request.method == 'POST':
        if 'profile_picture' not in request.FILES:
            return JsonResponse({'error': 'No file uploaded'}, status=400)
        profile_pic = request.FILES['profile_picture']

        user = Users.objects.get(id=request.user_id)
        user.profile_picture_url = profile_pic
        user.save()

        return JsonResponse({'message': 'Profile picture updated successfully'}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
@check_auth
def modify_username(request):
    if request.method == 'POST':
        if 'new_user_name' not in request.POST:
            return JsonResponse({'error': 'No username specified'}, status=400)
        
        new_user_name = request.POST['new_user_name']
        if Users.objects.filter(user_name=new_user_name).exists():
            return JsonResponse({'error': 'Username already in use'}, status=400)

        user = Users.objects.get(id=request.user_id)
        user.user_name = new_user_name
        user.save()
        return JsonResponse({'message': 'Username updated successfully'}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
@check_auth
def modify_firstname(request):
    if request.method == 'POST':
        if 'new_first_name' not in request.POST:
            return JsonResponse({'error': 'No name specified'}, status=400)
        
        new_first_name = request.POST['new_first_name']
        user = Users.objects.get(id=request.user_id)
        user.first_name = new_first_name
        user.save()
        return JsonResponse({'message': 'First name updated successfully'}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
@check_auth
def modify_lastname(request):
    if request.method == 'POST':
        if 'new_last_name' not in request.POST:
            return JsonResponse({'error': 'No name specified'}, status=400)
        
        new_last_name = request.POST['new_last_name']
        user = Users.objects.get(id=request.user_id)
        user.last_name = new_last_name
        user.save()
        return JsonResponse({'message': 'Last name updated successfully'}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
@check_auth
def modify_bio(request):
    if request.method == 'POST':
        if 'bio' not in request.POST:
            return JsonResponse({'error': 'No bio specified'}, status=400)
        
        bio = request.POST['bio']
        user = Users.objects.get(id=request.user_id)
        user.bio_description = bio
        user.save()
        return JsonResponse({'message': 'Bio description updated successfully'}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
@check_auth
def modify_email(request):
    if request.method == 'POST':
        if 'new_email' not in request.POST:
            return JsonResponse({'error': 'No email specified'}, status=400)
        
        new_email = request.POST['new_email']
        validator = EmailValidator()
        try:
            validator(new_email)
        except ValidationError:
            return JsonResponse({'error': 'Invalid email format'}, status=400)

        if Users.objects.filter(email=new_email).exists():
            return JsonResponse({'error': 'Email already in use'}, status=400)

        user = Users.objects.get(id=request.user_id)
        user.email = new_email
        user.save()
        return JsonResponse({'message': 'Email updated successfully'}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
@check_auth
def modify_password(request):
    if request.method == 'POST':
        if 'new_password' not in request.POST:
            return JsonResponse({'error': 'No password specified'}, status=400)
        
        new_password = request.POST['new_password']
        if not PasswordValidator(new_password):
            return JsonResponse({'error': 'Invalid password'}, status=400)
        
        user = Users.objects.get(id=request.user_id)
        user.password_hash = make_password(new_password)
        user.last_password_change = timezone.now()
        user.save()
        return JsonResponse({'message': 'Password updated successfully'}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
@check_auth
def logout(request):
    if request.method == 'POST':
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return JsonResponse({'error': 'Authorization header missing'}, status=401)
        
        token = auth_header.split(' ')[1]
        LoggedOutTokens.objects.create(token=token)
        return JsonResponse({'message': 'Logged out successfully'}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

# Friendship methods

@csrf_exempt
@check_auth
def add_friend(request):
    if request.method == 'POST':
        if 'friend_id' not in request.POST:
            return JsonResponse({'error': 'No friend specified'}, status=400)
        
        friend_id = request.POST['friend_id']
        friend = Users.objects.get(id=friend_id)
        if not friend:
            return JsonResponse({'error': 'Friend not found'}, status=404)
        
        user = Users.objects.get(id=request.user_id)
        if Friendship.objects.filter(from_user=user, to_user=friend).exists() or Friendship.objects.filter(from_user=friend, to_user=user).exists():
            return JsonResponse({'error': 'Friendship already exists'}, status=400)
        
        Friendship.objects.create(from_user=user, to_user=friend)
        return JsonResponse({'message': 'Friend added successfully'}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
@check_auth
def remove_friend(request):
    if request.method == 'POST':
        if 'friend_id' not in request.POST:
            return JsonResponse({'error': 'No friend specified'}, status=400)
        
        friend_id = request.POST['friend_id']
        friend = Users.objects.get(id=friend_id)
        if not friend:
            return JsonResponse({'error': 'Friend not found'}, status=404)
        
        user = Users.objects.get(id=request.user_id)
        friendship = Friendship.objects.filter(from_user=user, to_user=friend).first() or Friendship.objects.filter(from_user=friend, to_user=user).first()
        if not friendship:
            return JsonResponse({'error': 'Friendship does not exist'}, status=400)
        
        friendship.delete()
        return JsonResponse({'message': 'Friend removed successfully'}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
@check_auth
def get_friends(request):
    if request.method ==  'GET':
        user = Users.objects.get(id=request.user_id)
        friends = Friendship.objects.filter(Q(from_user=user) | Q(to_user=user), friendship_status='accepted')
        if not friends:
            return JsonResponse({'message': 'No friends found'}, status=200)
        friend_list = []
        for friend in friends:
            if friend.from_user == user:
                friend_list.append({
                    'id': friend.to_user.id,
                    'user_name': friend.to_user.user_name,
                    'first_name': friend.to_user.first_name,
                    'last_name': friend.to_user.last_name,
                    'online_status': friend.to_user.online_status
                })
            else:
                friend_list.append({
                    'id': friend.from_user.id,
                    'user_name': friend.from_user.user_name,
                    'first_name': friend.from_user.first_name,
                    'last_name': friend.from_user.last_name,
                    'online_status': friend.from_user.online_status
                })
        return JsonResponse({'friends': friend_list}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
@check_auth
def accept_friend(request):
    if request.method == 'POST':
        if 'friend_id' not in request.POST:
            return JsonResponse({'error': 'No friend specified'}, status=400)
        
        friend_id = request.POST['friend_id']
        friend = Users.objects.get(id=friend_id)
        if not friend:
            return JsonResponse({'error': 'Friend not found'}, status=404)
        
        user = Users.objects.get(id=request.user_id)
        friendship = Friendship.objects.filter(from_user=friend, to_user=user).first()
        if not friendship:
            return JsonResponse({'error': 'Friend request not found'}, status=404)
        
        friendship.friendship_status = 'accepted'
        friendship.save()
        return JsonResponse({'message': 'Friend request accepted successfully'}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
@check_auth
def reject_friend(request):
    if request.method == 'POST':
        if 'friend_id' not in request.POST:
            return JsonResponse({'error': 'No friend specified'}, status=400)
        
        friend_id = request.POST['friend_id']
        friend = Users.objects.get(id=friend_id)
        if not friend:
            return JsonResponse({'error': 'Friend not found'}, status=404)
        
        user = Users.objects.get(id=request.user_id)
        friendship = Friendship.objects.filter(from_user=friend, to_user=user).first()
        if not friendship:
            return JsonResponse({'error': 'Friend request not found'}, status=404)
        
        friendship.delete()
        return JsonResponse({'message': 'Friend request rejected successfully'}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
@check_auth
def get_friend_requests(request):
    if request.method == 'GET':
        user = Users.objects.get(id=request.user_id)
        friendships = Friendship.objects.filter(to_user=user, friendship_status='pending')
        if not friendships:
            return JsonResponse({'message': 'No friend requests'}, status=200)
        friend_requests = []
        for friendship in friendships:
            friend_requests.append({
                'id': friendship.from_user.id,
                'user_name': friendship.from_user.user_name,
                'first_name': friendship.from_user.first_name,
                'last_name': friendship.from_user.last_name,
            })
        return JsonResponse({'friend_requests': friend_requests}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)
