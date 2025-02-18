import logging
from .models import Users
import jwt
from datetime import datetime, timedelta
from backend import settings
from django.core.mail import EmailMessage

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

def send_2fa_email(mail, otp):
    subject = '2FA - Verify It\'s you!'
    body = (
        f'<h1>Hello there!</h1><br>'
        f'<p>Your OTP is: {otp}</p><br>'
        f'<p>This OTP will expire in 5 minutes.</p><br>'
        f'<p>If you did not request this OTP, please ignore this email.</p>'
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