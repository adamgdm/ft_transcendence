from django.shortcuts import render
from django.core.validators import EmailValidator
from django.core.exceptions import ValidationError
from .models import Users, Oauth2AuthenticationData
from django.contrib.auth.hashers import make_password
from django.http import JsonResponse, HttpRequest, HttpResponse
from .utils import UsernameValidator, PasswordValidator, NameValidator, generate_jwt_token, decode_jwt_token, verify_jwt_token, send_2fa_email, send_2fa_email_verification
from django.db.models import Q
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.hashers import check_password
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from .decorators import check_auth
from datetime import datetime, timedelta
from django.utils import timezone
from django.conf import settings
from .models import BlacklistedTokens, LoggedOutTokens, Friendship
import json
import random
from django.shortcuts import redirect
from django.contrib.auth import authenticate, login
import requests

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
def delete_account(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'could not fetch data'}, status=400)
        email = data.get('email')
        try:
            user = Users.objects.get(email=email)
            if user.is_Email_Verified is True:
                return JsonResponse({'error': 'Account verified'}, status=400)
            user.delete()
        except Exception as e: 
            return JsonResponse({'error': f'An error occured: {e}'}, status=500)
        return JsonResponse({'message': 'User deleted successfully'}, status=201)
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
            samesite='None',
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
            samesite='None',
            max_age=601
        )
        return response
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
@check_auth
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
@check_auth
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
            'last_password_change': user.last_password_change,
            'ppp_rating': user.ppp_rating,
            'title': user.title,
            'win_ratio': user.win_ratio,
            'matches_played': user.matches_played
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
        data = json.loads(request.body)
        
        # Verify required fields
        if 'currentPassword' not in data or 'new_password' not in data:
            return JsonResponse({'error': 'Missing required fields'}, status=400)
        
        current_password = data['currentPassword']
        new_password = data['new_password']
        
        
        if not PasswordValidator(new_password):
            return JsonResponse({'error': 'Invalid password'}, status=400)
        
        user = Users.objects.get(id=request.user_id)
        user.password_hash = make_password(new_password)
        user.last_password_change = timezone.now()
        user.save()
        return JsonResponse({'success': True}, status=200)
    return JsonResponse({'success': False, 'error': 'Invalid request method'})

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

@csrf_exempt
@check_auth
def update_profile(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        user = Users.objects.get(id=request.user_id) 

        # Update fields if provided
        if 'firstName' in data:
            user.first_name = data['firstName']
        if 'lastName' in data:
            user.last_name = data['lastName']
        if 'userName' in data:
            # Check if username is available
            if Users.objects.filter(user_name=data['userName']).exclude(id=user.id).exists():
                return JsonResponse({'success': False, 'error': 'Username already taken'}, status=400)
            user.user_name = data['userName']
        if 'email' in data:
            # Check if email is available
            if Users.objects.filter(email=data['email']).exclude(id=user.id).exists():
                return JsonResponse({'success': False, 'error': 'Email already in use'}, status=400)
            user.email = data['email']
            
        # Save changes
        user.save()
        return JsonResponse({'success': True})

    return JsonResponse({'success': False, 'error': 'Invalid request method'})

# Friendship methods


@csrf_exempt
@check_auth
def add_friend(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            friend_username = data.get('friend_username')
            if not friend_username:
                return JsonResponse({'error': 'No friend specified'}, status=400)
        except (json.JSONDecodeError, KeyError):
            return JsonResponse({'error': 'Invalid request format'}, status=400)
        
        try:
            friend = Users.objects.get(user_name=friend_username)
        except Users.DoesNotExist:
            return JsonResponse({'error': 'Friend not found'}, status=404)
        
        user = Users.objects.get(id=request.user_id)
        if Friendship.objects.filter(Q(from_user=user, to_user=friend) | Q(from_user=friend, to_user=user)).exists():
            return JsonResponse({'error': 'Friendship already exists or pending'}, status=400)
        
        Friendship.objects.create(from_user=user, to_user=friend, friendship_status='pending')
        
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"friendship_group_{friend.id}",
            {
                'type': 'friend_request_notification',
                'message': f'{user.user_name} sent you a friend request.',
                'from_user_id': user.id,
                'from_username': user.user_name
            }
        )
        
        return JsonResponse({'message': 'Friend request sent successfully'}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
@check_auth
def cancel_invite(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            friend_username = data.get('friend_username')
            if not friend_username:
                return JsonResponse({'error': 'No friend specified'}, status=400)
        except (json.JSONDecodeError, KeyError):
            return JsonResponse({'error': 'Invalid request format'}, status=400)
        
        try:
            friend = Users.objects.get(user_name=friend_username)
        except Users.DoesNotExist:
            return JsonResponse({'error': 'Friend not found'}, status=404)
        
        user = Users.objects.get(id=request.user_id)
        friendship = Friendship.objects.filter(from_user=user, to_user=friend, friendship_status='pending').first()
        if not friendship:
            return JsonResponse({'error': 'Friend request not found or already processed'}, status=404)
        
        friendship.delete()
        
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"friendship_group_{friend.id}",
            {
                'type': 'friend_update_notification',
                'message': f'{user.user_name} canceled the friend request.',
                'friend_id': user.id
            }
        )
        
        return JsonResponse({'message': 'Friend request canceled successfully'}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
@check_auth
def remove_friend(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            friend_username = data.get('friend_username')
            if not friend_username:
                return JsonResponse({'error': 'No friend specified'}, status=400)
        except (json.JSONDecodeError, KeyError):
            return JsonResponse({'error': 'Invalid request format'}, status=400)
        
        try:
            friend = Users.objects.get(user_name=friend_username)
        except Users.DoesNotExist:
            return JsonResponse({'error': 'Friend not found'}, status=404)
        
        user = Users.objects.get(id=request.user_id)
        friendship = Friendship.objects.filter(Q(from_user=user, to_user=friend) | Q(from_user=friend, to_user=user)).first()
        if not friendship:
            return JsonResponse({'error': 'Friendship does not exist'}, status=400)
        
        friendship.delete()
        
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"friendship_group_{friend.id}",
            {
                'type': 'friend_update_notification',
                'message': f'{user.user_name} removed you as a friend.',
                'friend_id': user.id
            }
        )
        
        return JsonResponse({'message': 'Friend removed successfully'}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
@check_auth
def get_friends(request):
    if request.method == 'GET':
        user = Users.objects.get(id=request.user_id)
        friendships = Friendship.objects.filter(
            Q(from_user=user, friendship_status='accepted') | 
            Q(to_user=user, friendship_status='accepted')
        )
        
        friends_list = [
            {
                'id': friendship.to_user.id if friendship.from_user == user else friendship.from_user.id,
                'username': friendship.to_user.user_name if friendship.from_user == user else friendship.from_user.user_name,
                'status': 'accepted'
            }
            for friendship in friendships
        ]
        
        return JsonResponse({'friends': friends_list}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
@check_auth
def accept_friend(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            friend_username = data.get('friend_username')
            if not friend_username:
                return JsonResponse({'error': 'No friend specified'}, status=400)
        except (json.JSONDecodeError, KeyError):
            return JsonResponse({'error': 'Invalid request format'}, status=400)
        
        try:
            friend = Users.objects.get(user_name=friend_username)
        except Users.DoesNotExist:
            return JsonResponse({'error': 'Friend not found'}, status=404)
        
        user = Users.objects.get(id=request.user_id)
        friendship = Friendship.objects.filter(from_user=friend, to_user=user, friendship_status='pending').first()
        if not friendship:
            return JsonResponse({'error': 'Friend request not found'}, status=404)
        
        friendship.friendship_status = 'accepted'
        friendship.save()
        
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"friendship_group_{friend.id}",
            {
                'type': 'friend_update_notification',
                'message': f'{user.user_name} accepted your friend request!',
                'friend_id': user.id
            }
        )
        
        return JsonResponse({'message': 'Friend request accepted successfully'}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
@check_auth
def reject_friend(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            friend_username = data.get('friend_username')
            if not friend_username:
                return JsonResponse({'error': 'No friend specified'}, status=400)
        except (json.JSONDecodeError, KeyError):
            return JsonResponse({'error': 'Invalid request format'}, status=400)
        
        try:
            friend = Users.objects.get(user_name=friend_username)
        except Users.DoesNotExist:
            return JsonResponse({'error': 'Friend not found'}, status=404)
        
        user = Users.objects.get(id=request.user_id)
        friendship = Friendship.objects.filter(from_user=friend, to_user=user, friendship_status='pending').first()
        if not friendship:
            return JsonResponse({'error': 'Friend request not found'}, status=404)
        
        friendship.delete()
        
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"friendship_group_{friend.id}",
            {
                'type': 'friend_update_notification',
                'message': f'{user.user_name} rejected your friend request.',
                'friend_id': user.id
            }
        )
        
        return JsonResponse({'message': 'Friend request rejected successfully'}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
@check_auth
def get_friend_requests(request):
    if request.method == 'GET':
        user = Users.objects.get(id=request.user_id)
        pending_requests = Friendship.objects.filter(to_user=user, friendship_status='pending')
        
        requests_list = [
            {
                'from_user_id': request.from_user.id,
                'from_username': request.from_user.user_name,
                'status': 'pending'
            }
            for request in pending_requests
        ]
        
        return JsonResponse({'requests': requests_list}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
@check_auth
def search_users(request):
    if request.method == 'GET':
        query = request.GET.get('query', '').strip()
        if not query:
            return JsonResponse({'users': []}, status=200)
        
        user = Users.objects.get(id=request.user_id)
        matching_users = Users.objects.filter(user_name__istartswith=query).exclude(id=user.id)[:5]
        
        users_list = [{'id': u.id, 'username': u.user_name} for u in matching_users]
        return JsonResponse({'users': users_list}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

# New View for Sent Friend Requests
@csrf_exempt
@check_auth
def get_sent_friend_requests(request):
    if request.method == 'GET':
        user = Users.objects.get(id=request.user_id)
        sent_requests = Friendship.objects.filter(from_user=user, friendship_status='pending')
        
        requests_list = [
            {
                'to_user_id': request.to_user.id,
                'to_username': request.to_user.user_name,
                'status': 'pending'
            }
            for request in sent_requests
        ]
        
        return JsonResponse({'sent_requests': requests_list}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

# Additional Useful Views
@csrf_exempt
@check_auth
def get_friendship_status(request):
    if request.method == 'GET':
        friend_username = request.GET.get('friend_username', '').strip()
        if not friend_username:
            return JsonResponse({'error': 'No friend specified'}, status=400)
        
        try:
            friend = Users.objects.get(user_name=friend_username)
        except Users.DoesNotExist:
            return JsonResponse({'error': 'Friend not found'}, status=404)
        
        user = Users.objects.get(id=request.user_id)
        friendship = Friendship.objects.filter(
            Q(from_user=user, to_user=friend) | Q(from_user=friend, to_user=user)
        ).first()
        
        if not friendship:
            return JsonResponse({'status': 'none'}, status=200)
        return JsonResponse({
            'status': friendship.friendship_status,
            'direction': 'sent' if friendship.from_user == user else 'received'
        }, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
@check_auth
def bulk_friend_status(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            usernames = data.get('usernames', [])
            if not usernames:
                return JsonResponse({'error': 'No usernames provided'}, status=400)
        except (json.JSONDecodeError, KeyError):
            return JsonResponse({'error': 'Invalid request format'}, status=400)
        
        user = Users.objects.get(id=request.user_id)
        statuses = {}
        
        for username in usernames:
            try:
                friend = Users.objects.get(user_name=username)
                friendship = Friendship.objects.filter(
                    Q(from_user=user, to_user=friend) | Q(from_user=friend, to_user=user)
                ).first()
                statuses[username] = {
                    'status': friendship.friendship_status if friendship else 'none',
                    'direction': 'sent' if friendship and friendship.from_user == user else 'received' if friendship else None
                }
            except Users.DoesNotExist:
                statuses[username] = {'status': 'not_found', 'direction': None}
        
        return JsonResponse({'statuses': statuses}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

#need to hide data in env
auth_url_42 = "https://api.intra.42.fr/oauth/authorize?client_id=u-s4t2ud-729aed93b28338bae314686c66e3342c44503b544a2906dcb18c0cfc4080570e&redirect_uri=http%3A%2F%2F127.0.0.1%3A8000%2Foauth2%2Flogin%2Fredirect%2F&response_type=code"
@csrf_exempt
def oauth2(request):
    return JsonResponse({"mssg": "hello"})

@csrf_exempt
def oauth2_login(request):
    if request.method == 'POST':
        return redirect(auth_url_42)

@csrf_exempt
def oauth2_login_redirect(request):
    code = request.GET.get("code")
    if not code:
        return JsonResponse({"error": "No authorization code provided"}, status=400)

    try:
        user_data = exchange_code(code)
        return JsonResponse(user_data)
    except Exception as e:
        return JsonResponse({"error EXCHANGECODE": f"Authentication failed: {str(e)}"}, status=500)

@csrf_exempt
def exchange_code(code):
    data = {
        "grant_type": "authorization_code",
        "client_id": "u-s4t2ud-729aed93b28338bae314686c66e3342c44503b544a2906dcb18c0cfc4080570e",
        "client_secret": "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",
        "code": code,
        "redirect_uri" : "http://127.0.0.1:8000/oauth2/login/redirect/",#actual domain name
        # "scope": "public"
    }
    headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    }
    try:
        response = requests.post("https://api.intra.42.fr/oauth/token", data=data, headers=headers)
        if response.status_code != 200:
            raise Exception(f"Failed to exchange code {response.text} and this is the response {response.status_code}")

        token_data = response.json()

        access_token = token_data.get("access_token")
        expires_in = token_data.get("expires_in")
        refresh_token = token_data.get("refresh_token")
        created_at = token_data.get("created_at")
        secret_valid_until = token_data.get("secret_valid_until")

        # print(f'this is the response {response}') i gotta integrate the refresh token function here !!!!!!!!!!!!!!!!!
        print(access_token)
        print("=================================================")


        user_response = requests.get("https://api.intra.42.fr/v2/me", headers={
            'Authorization': "Bearer %s" % access_token
        })
        if user_response.status_code != 200:
            raise Exception(f"Failed to get user data {user_response.text}")
        user_data = user_response.json()
        print(response.json())
# ///////////////////////////////////////////////////////////////////////////////////////
        try:
            user, created = Users.objects.get_or_create(
                intra_id=user_data.get('id'),
                defaults={
                    'user_name': user_data.get('login'),
                    'email': user_data.get('email'),
                    'first_name': user_data.get('first_name'),
                    'last_name': user_data.get('last_name'),
                    'profile_pic_42': user_data.get('image').get("link"),
                    'intra_url': user_data.get('url'),
                    'oauth2_authentified': True
                    # Add any other fields you want to store
                }
            )

            # Store OAuth2 data
            oauth_data, created = Oauth2AuthenticationData.objects.update_or_create(
                user=user,  # Link to user
                defaults={
                    'Oauth2_id': user_data.get('id'),
                    'Oauth2Token': access_token,
                    'Oauth2TokenExpiresIn': expires_in,
                    'Oauth2RefreshToken': refresh_token,
                    'Oauth2CreateAt': created_at,
                    'Oauth2ValidUntil': secret_valid_until
                }
            )
            # return JsonResponse(Oauth2AuthenticationData.objects.all())
            # print(Oauth2AuthenticationData.objects.all()) 
            # Log the user in (optional, depends on your authentication system)

            # Return success response with user data
            return user_data
                # 'success': True,
                # 'user': {
                #     'id': user.id,
                #     'username': user.user_name,
                #     'email': user.email,
                #     'first_name': user.first_name,
                #     'last_name': user.last_name,
                #     'profile_pic': user.profile_pic_42
                # }
            # }
        except Exception as e:
            raise Exception(f"Error creating/updating user: {str(e)}")
    
    except Exception as e:
        raise Exception(f"Authentication failed: {str(e)}")
        # /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        # try:
        #     user = Users.objects.create(
        #         user_name=
        #     )
        # print(f"this is the response {response}")

        # user = response.json()


        # return user


    #  +--------+                               +---------------+
    #  |        |--(A)- Authorization Request ->|   Resource    |
    #  |        |                               |     Owner     |
    #  |        |<-(B)-- Authorization Grant ---|               |
    #  |        |                               +---------------+
    #  |        |
    #  |        |                               +---------------+
    #  |        |--(C)-- Authorization Grant -->| Authorization |
    #  | Client |                               |     Server    |
    #  |        |<-(D)----- Access Token -------|               |
    #  |        |                               +---------------+
    #  |        |
    #  |        |                               +---------------+
    #  |        |--(E)----- Access Token ------>|    Resource   |
    #  |        |                               |     Server    |
    #  |        |<-(F)--- Protected Resource ---|               |
    #  +--------+                               +---------------+

# def refresh_token(token):
#     data = {
#         "grant-type" : "refresh_token",
#         "client_id": "u-s4t2ud-729aed93b28338bae314686c66e3342c44503b544a2906dcb18c0cfc4080570e",
#         "client_secret": "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",
#         "refresh_token" : token
#         # "scope": "public"
#     }
#     headers = {
#         "Content-Type" : "application/x-www-form-urlencoded"
#     }

#     try:
#         response = requests.post("https://api.intra.42.fr/oauth/token", data=data, headers=headers)
#     except Exception:
#         return JsonResponse({'error': 'could not fetch data'}, status=400)
    
#     response = response.json()
    
#     access_token = response.get("access_token")
#     expires_in = response.get("expires_in")
#     refresh_token = response.get("refresh_token")
#     created_at = response.get("created_at")
#     secret_valid_until = response.get("secret_valid_until")
    
#     try:
#         oauthData = Oauth2AuthenticationData.objects.create(
#             Oauth2_id = 
#             Oauth2Token = access_token
#             Oauth2TokenExpiresIn = expires_in 
#             Oauth2RefreshToken = refresh_token
#             Oauth2CreateAt = created_at
#             Oauth2ValidUntil = secret_valid_until
#         )
#     except Exception as e: 
#             return JsonResponse({'error': f'An error occured: {e}'}, status=500)
    
#     # print(f'this is the response {response}')
#     print(access_token)
#     print("=================================================")
#     print(response.json())
#     try:
#         response = requests.get("https://api.intra.42.fr/v2/me", headers={
#             'Authorization': "Bearer %s" % access_token
#         })
#     except Exception:
#         return JsonResponse({'error': 'could not fetch data'}, status=400)
#     # try:
#     #     user = Users.objects.create(
#     #         user_name=
#     #     )
#     print(f"this is the response {response}")
    
#     user = response.json()
    
    
#     return user

def refresh_token_if_needed(user_id):
    try:
        oauth_data = Oauth2AuthenticationData.objects.get(user_id=user_id)
        
        # Call the refresh endpoint
        data = {
            "grant_type": "refresh_token",
            "client_id": "u-s4t2ud-729aed93b28338bae314686c66e3342c44503b544a2906dcb18c0cfc4080570e",
            "client_secret": "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",
            "refresh_token": oauth_data.Oauth2RefreshToken
        }
        headers = {
            "Content-Type": "application/x-www-form-urlencoded"
        }
        
        response = requests.post("https://api.intra.42.fr/oauth/token", data=data, headers=headers)
        if response.status_code == 200:
            token_data = response.json()
            
            # Update the database
            oauth_data.Oauth2Token = token_data.get("access_token")
            oauth_data.Oauth2TokenExpiresIn = token_data.get("expires_in")
            oauth_data.Oauth2RefreshToken = token_data.get("refresh_token", oauth_data.Oauth2RefreshToken)
            oauth_data.Oauth2CreateAt = token_data.get("created_at")
            oauth_data.save()
            
            return oauth_data.Oauth2Token
        else:
            return None
    except Exception:
        return None
# #   +--------+                                           +---------------+
# #   |        |--(A)------- Authorization Grant --------->|               |
# #   |        |                                           |               |
# #   |        |<-(B)----------- Access Token -------------|               |
# #   |        |               & Refresh Token             |               |
# #   |        |                                           |               |
# #   |        |                            +----------+   |               |
# #   |        |--(C)---- Access Token ---->|          |   |               |
# #   |        |                            |          |   |               |
# #   |        |<-(D)- Protected Resource --| Resource |   | Authorization |
# #   | Client |                            |  Server  |   |     Server    |
# #   |        |--(E)---- Access Token ---->|          |   |               |
# #   |        |                            |          |   |               |
# #   |        |<-(F)- Invalid Token Error -|          |   |               |
# #   |        |                            +----------+   |               |
# #   |        |                                           |               |
# #   |        |--(G)----------- Refresh Token ----------->|               |
# #   |        |                                           |               |
# #   |        |<-(H)----------- Access Token -------------|               |
# #   +--------+           & Optional Refresh Token        +---------------+
# # Unlike access tokens, refresh tokens are
# # intended for use only with authorization servers and are never sent
# # to resource servers.