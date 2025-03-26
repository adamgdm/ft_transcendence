from django.db import models
from django.db import IntegrityError
from django.contrib.auth.hashers import check_password
from django.db import IntegrityError
import random

def user_directory_path(instance, filename):
    # file will be uploaded to MEDIA_ROOT/user_<id>/<filename>
    return f'user_{instance.id}/{filename}'

def generate_unique_ppp():
    return(random.randint(1000, 1400))

class Users(models.Model):
    class AccountStatusChoices(models.TextChoices):
        ACTIVE = 'active'
        BANNED = 'banned'
        DEACTIVATED = 'deactivated'

    id = models.AutoField(primary_key=True)
    eth_address = models.CharField(max_length=42, unique=True, null=True, blank=True)
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
    oauth2_data = models.OneToOneField('Oauth2AuthenticationData', on_delete=models.CASCADE, null=True, blank=True)
    has_profile_pic = models.BooleanField(default=False, blank=False)
    has_42_image = models.BooleanField(default=False, blank=False)
    oauth2_authentified = models.BooleanField(default=False, blank=False) #just added
    is_Email_Verified = models.BooleanField(default=False)#true when oauth2
    registration_date = models.DateTimeField(auto_now_add=True)
    online_status = models.DateTimeField(auto_now_add=True)
    last_login = models.DateTimeField(null=True, blank=True)
    last_password_change = models.DateTimeField(null=True, blank=True)
    ppp_rating = models.IntegerField(unique=True, db_index=True)
    title = models.CharField(default="NEWBIE") #first is called a leader
    matches_played = models.IntegerField(default=0, null=False, blank=False)
    matches_won = models.IntegerField(default=0, null=False, blank=False)
    win_ratio = models.IntegerField(default=0, null=False, blank=False)
    matches_history = models.ManyToManyField("gameBackend.Match")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Only set initial PPP if not provided and object is new
        if not self.pk and not self.ppp_rating:
            self.ppp_rating = generate_unique_ppp()

    def save(self, *args, **kwargs):
        # Ensure the ppp rating is unique
        while True:
            try:
                self.update_ppp_ratings()
                super().save(*args, **kwargs)
                break
            except IntegrityError:
                luck_factor = random.randint(1, 50)
                if(luck_factor % 2 == 0):
                    self.ppp_rating += luck_factor
                else:
                    self.ppp_rating -= luck_factor
                self.ppp_rating = max(self.ppp_rating, 0)
                
    def update_ppp_ratings(self):
        user_with_highest_ppp = Users.objects.order_by('-ppp_rating').first()
        if(self.ppp_rating >= 2000):
            if(self == user_with_highest_ppp):
                self.title = "LEADER"
            else:
                self.title = "CHALLENGER"
        else:
            self.title = "NEWBIE"



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
    class Status(models.TextChoices):
        PENDING = 'pending'
        ACCEPTED = 'accepted'
        REJECTED = 'rejected'
    from_user = models.ForeignKey(Users, on_delete=models.CASCADE, related_name='user_id')
    to_user = models.ForeignKey(Users, on_delete=models.CASCADE, related_name='friend_id')
    friendship_status = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING)
    friendship_date = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ('from_user', 'to_user')

