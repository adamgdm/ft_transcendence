import logging
from .models import Users
import jwt
from datetime import datetime, timedelta
from backend import settings
from django.core.mail import EmailMessage
import math
import re

def UsernameValidator(user_name):
    if not user_name.isalnum():
        return False
    if len(user_name) < 3 or len(user_name) > 20:
        return False
    return True

def PasswordValidator(password):
    if len(password) < 8:
        return False
    if not any(char.isdigit() for char in password):
        return False
    if not any(char.isupper() for char in password):
        return False
    if not any(char.islower() for char in password):
        return False
    return True

def NameValidator(name):
    if len(name) > 128:
        return False
    if not name.isalpha():
        return False
    return True

def generate_jwt_token(user):
    payload = {
        "user_id": user.id,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(minutes=10)
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')
    return token

def decode_jwt_token(token):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def verify_jwt_token(token):
    payload = decode_jwt_token(token)
    return payload is not None


logger = logging.getLogger(__name__)

def send_2fa_email(mail, otp, choices):
    if (choices == 1):
        subject = '2FA - Verify It\'s you!'
        body = (
            f'<h1>Hello there!</h1><br>'
            f'<p>Your OTP is: {otp}</p><br>'
            f'<p>This OTP will expire in 5 minutes.</p><br>'
            f'<p>If you did not request this OTP, please ignore this email.</p>'
        )
    else:
        subject = 'Verify It\'s your email!'
        body = (
            f'<h1>Hello there!</h1><br>'
            f'<p>Your Verification number is: {otp}</p><br>'
            f'<p>This Verification number will expire in 15 minutes.</p><br>'
            f'<p>If you did not request this, please ignore this email.</p>'
        )

    from_email = settings.EMAIL_HOST_USER
    recipient_list = [mail]
    
    email = EmailMessage(subject=subject, body=body, from_email=from_email, to=recipient_list)
    email.content_subtype = 'html'
    
    try:
        email.send()
    except Exception as e:
        logger.error(f'Failed to send email: {e}')
        return False
    return True

def calculate_ppp(player_rating, opps_rating, result, k_factor=32): #result is a bool
    expected_score = 1 / (1 + 10 ** ((opponent_rating - player_rating) / 400))
    new_rating = player_rating + k_factor * (result - expected_score)
    return round(new_rating)

def update_ppp_ratings(player1, player2, result):
    player1_rating = player1.ppp_rating
    player2_rating = player2.ppp_rating

    # Update player1's rating
    player1.ppp_rating = calculate_ppp(player1_rating, player2_rating, result)
    # player1.save()

    # Update player2's rating
    player2.ppp_rating = calculate_ppp(player2_rating, player1_rating, 1 - result)
    # player2.save()


# example of using these functions

# # Assume player1 and player2 are instances of the Player model
# player1 = Player.objects.get(id=1)
# player2 = Player.objects.get(id=2)    
# # Player 1 wins
# update_ppp_ratings(player1, player2, result=1)

# # Player 2 wins
# update_ppp_ratings(player1, player2, result=0)
def send_2fa_email_verification(mail, otp):
    subject = 'Verify It\'s your email!'
    body = (
        f'<h1>Hello there!</h1><br>'
        f'<p>Your Verification number is: {otp}</p><br>'
        f'<p>This Verification number will expire in 15 minutes.</p><br>'
        f'<p>If you did not request this, please ignore this email.</p>'
    )
    from_email = settings.EMAIL_HOST_USER
    recipient_list = [mail]
    
    
    email = EmailMessage(subject=subject, body=body, from_email=from_email, to=recipient_list)
    email.content_subtype = 'html'
    
    try:
        email.send()
    except Exception as e:
        logger.error(f'Failed to send email: {e}')
        return False
    return True

def is_valid_email(email):
    # Regex to check if email ends with @student.1337.ma
    if re.match(r".+@student\.1337\.ma$", email):
        return False  # Reject the email if it matches the pattern
    return True  # Accept the email if it doesn't match
