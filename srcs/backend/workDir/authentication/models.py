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
    profile_pic_42 = models.URLField(null=True, blank=True)
    first_name = models.CharField(max_length=128)
    last_name = models.CharField(max_length=128)
    bio_description = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    intra_url = models.URLField(null=True, blank=True)
    intra_id = models.IntegerField(unique=True, null=True, blank=True)
    password_hash = models.CharField(max_length=128, null=True, blank=True) #null True, blank=True case where user only loged with 42
    otp_password = models.CharField(max_length=6, blank=True)
    otp_expiry = models.DateTimeField(null=True, blank=True)
    account_status = models.CharField(max_length=15, choices=AccountStatusChoices.choices, default=AccountStatusChoices.ACTIVE)
    two_factor_enabled = models.BooleanField(default=False)
    two_factor_info = models.OneToOneField('TwoFactorData', on_delete=models.CASCADE, null=True, blank=True)
    oauth2_authentified = models.BooleanField(default=False) #just added
    oauth2_data = models.OneToOneField('Oauth2AuthenticationData', on_delete=models.CASCADE, null=True, blank=True)
    registration_date = models.DateTimeField(auto_now_add=True)
    online_status = models.DateTimeField(auto_now_add=True)
    last_login = models.DateTimeField(null=True, blank=True)
    last_password_change = models.DateTimeField(null=True, blank=True)
    ppp_rating = models.IntegerField(default=1200)
    # title = models.CharField(default="CHALLENGER") first is called a leader


class BlacklistedTokens(models.Model):
    token = models.CharField(max_length=255)
    blacklisted_at = models.DateTimeField(auto_now_add=True)

class LoggedOutTokens(models.Model):
    token = models.CharField(max_length=255)
    logged_out_at = models.DateTimeField(auto_now_add=True)

class Oauth2AuthenticationData(models.Model):
    user = models.OneToOneField(Users, on_delete=models.CASCADE, related_name='oauth2_info')
    Oauth2_id = models.IntegerField(primary_key=True)
    Oauth2Token = models.CharField(max_length=255)
    Oauth2TokenExpiresIn = models.IntegerField()
    Oauth2RefreshToken = models.CharField(max_length=255)
    Oauth2CreateAt = models.IntegerField()
    Oauth2ValidUntil =  models.IntegerField()

    # oauth2_expiring_date = models.DateTimeField(null=True, blank=True)

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