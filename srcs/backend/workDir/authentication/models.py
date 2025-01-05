from django.db import models

def user_directory_path(obj, filename):
    #will be defined later
    return False

class Users(models.Model):
    class AccountStatusChoices(models.TextChoices):
        ACTIVE = 'active'
        BANNED = 'banned'
        DEACTIVATED = 'deactivated'

    id = models.AutoField(primary_key = True)
    user_name = models.CharField(max_length=255)
    profile_picture_url = models.ImageField(upload_to=user_directory_path, null=True, blank=True)
    first_name = models.CharField(max_length=128)
    last_name = models.CharField(max_length=128)
    bio_description = models.CharField(max_length=255)
    email = models.EmailField()
    password_hash = models.CharField(max_length=128)
    otp_password = models.CharField(max_length=6, blank=True)
    account_status = models.CharField(max_length=15, choices=AccountStatusChoices.choices, default=AccountStatusChoices.ACTIVE)
    jwt_token = models.TextField(null=True, blank=True)
    two_factor_enabled = models.BooleanField(default=False)
    two_factor_backup_codes = models.TextField(null=True, blank=True)
    
    registration_date = models.DateTimeField(auto_now_add=True)
    last_login = models.DateTimeField(null=True, blank=True)
    last_password_change = models.DateTimeField(null=True, blank=True)

# total_wins = models.IntegerField(default=0)
# total_losses = models.IntegerField(default=0)
# total_games_played = models.IntegerField(default=0)
# highest_score = models.IntegerField(default=0)
# current_streak = models.IntegerField(default=0)