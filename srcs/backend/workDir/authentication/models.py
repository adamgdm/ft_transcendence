from django.db import models
from django.contrib.auth.hashers import check_password

def user_directory_path(instance, filename):
    # file will be uploaded to MEDIA_ROOT/user_<id>/<filename>
    return f'user_{instance.id}/{filename}'

class Users(models.Model):
    class AccountStatusChoices(models.TextChoices):
        ACTIVE = 'active'
        BANNED = 'banned'
        DEACTIVATED = 'deactivated'

    id = models.AutoField(primary_key=True)
    user_name = models.CharField(max_length=255, unique=True)
    profile_picture_url = models.ImageField(upload_to=user_directory_path, null=True, blank=True)
    first_name = models.CharField(max_length=128)
    last_name = models.CharField(max_length=128)
    bio_description = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    password_hash = models.CharField(max_length=128)
    otp_password = models.CharField(max_length=6, blank=True)
    otp_expiry = models.DateTimeField(null=True, blank=True)
    account_status = models.CharField(max_length=15, choices=AccountStatusChoices.choices, default=AccountStatusChoices.ACTIVE)
    two_factor_enabled = models.BooleanField(default=False)
    two_factor_info = models.OneToOneField('TwoFactorData', on_delete=models.CASCADE, null=True, blank=True)

    is_Email_Verified = models.BooleanField(default=False)
    registration_date = models.DateTimeField(auto_now_add=True)
    online_status = models.DateTimeField(auto_now_add=True)
    last_login = models.DateTimeField(null=True, blank=True)
    last_password_change = models.DateTimeField(null=True, blank=True)

class BlacklistedTokens(models.Model):
    token = models.CharField(max_length=255)
    blacklisted_at = models.DateTimeField(auto_now_add=True)

class LoggedOutTokens(models.Model):
    token = models.CharField(max_length=255)
    logged_out_at = models.DateTimeField(auto_now_add=True)

class TwoFactorData(models.Model):
    user_id = models.OneToOneField(Users, on_delete=models.CASCADE)
    two_factor_digits = models.CharField(max_length=6)
    expires_at = models.DateTimeField()

class Friendship(models.Model):
    class FriendshipStatusChoices(models.TextChoices):
        PENDING = 'pending'
        ACCEPTED = 'accepted'
    from_user = models.ForeignKey(Users, on_delete=models.CASCADE, related_name='user_id')
    to_user = models.ForeignKey(Users, on_delete=models.CASCADE, related_name='friend_id')
    friendship_status = models.CharField(max_length=15, choices=FriendshipStatusChoices.choices, default=FriendshipStatusChoices.PENDING)
    friendship_date = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ('from_user', 'to_user')
