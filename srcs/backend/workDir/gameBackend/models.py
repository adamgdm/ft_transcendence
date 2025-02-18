from django.db import models
from authentication.models import Users

class Match(models.Model):
    class MatchStatusChoices(models.TextChoices):
        PENDING = 'pending'
        DONE = 'done'
        CANCELLED = 'cancelled'
    
    class GameOpponentChoices(models.TextChoices):
        SAME_COMPUTER = 'same_computer'
        AI = 'AI'
        ONLINE = 'online'
    id = models.AutoField(primary_key=True)
    match_name = models.CharField(max_length=255)
    match_status = models.CharField(max_length=15, choices=MatchStatusChoices.choices, default=MatchStatusChoices.PENDING)
    game_opponent = models.CharField(max_length=15, choices=GameOpponentChoices.choices, default=GameOpponentChoices.SAME_COMPUTER)
    player_1 = models.ForeignKey(Users, on_delete=models.CASCADE, related_name='player_1')
    player_2 = models.ForeignKey(Users, on_delete=models.CASCADE, related_name='player_2')
    score_player_1 = models.IntegerField(null=True, blank=True)
    score_player_2 = models.IntegerField(null=True, blank=True)
    match_winner = models.ForeignKey(Users, on_delete=models.CASCADE, related_name='match_winner', null=True, blank=True)
    match_loser = models.ForeignKey(Users, on_delete=models.CASCADE, related_name='match_loser', null=True, blank=True)
    match_creation_date = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ('player_1', 'player_2', 'match_creation_date')
