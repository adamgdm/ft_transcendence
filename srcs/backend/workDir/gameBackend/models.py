from django.db import models
from authentication.models import Users

class Match(models.Model):
    class MatchStatusChoices(models.TextChoices):
        PENDING = 'pending'
        DONE = 'done'
        CANCELLED = 'cancelled'
    
    class GameOpponentChoices(models.TextChoices):
        LOCAL = 'local'
        ONLINE = 'online'
    id = models.AutoField(primary_key=True)
    match_name = models.CharField(max_length=255)
    match_status = models.CharField(max_length=15, choices=MatchStatusChoices.choices, default=MatchStatusChoices.PENDING)
    game_opponent = models.CharField(max_length=15, choices=GameOpponentChoices.choices, default=GameOpponentChoices.LOCAL)
    player_1 = models.ForeignKey(Users, on_delete=models.CASCADE, related_name='player_1')
    player_2 = models.ForeignKey(Users, on_delete=models.CASCADE, related_name='player_2')
    score_player_1 = models.IntegerField(null=True, blank=True)
    score_player_2 = models.IntegerField(null=True, blank=True)
    match_winner = models.ForeignKey(Users, on_delete=models.CASCADE, related_name='match_winner', null=True, blank=True)
    match_loser = models.ForeignKey(Users, on_delete=models.CASCADE, related_name='match_loser', null=True, blank=True)
    match_creation_date = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ('player_1', 'player_2', 'match_creation_date')

class GameInvites(models.Model):
    class GameInviteStatus(models.TextChoices):
        PENDING = 'pending'
        ACCEPTED = 'accepted'
        REFUSED = 'refused'
    class GameModes(models.TextChoices):
        ONLINE = 'online'
        TOURNAMENT = 'tournament'
    from_user = models.ForeignKey(Users, on_delete=models.CASCADE, related_name='game_invites_sent')
    to_user = models.ForeignKey(Users, on_delete=models.CASCADE, related_name='game_invites_received')
    status = models.CharField(choices=GameInviteStatus.choices, default=GameInviteStatus.PENDING)
    game_mode = models.CharField(choices=GameModes.choices)
    issued_at = models.DateTimeField(auto_now_add=True)
    game_id = models.CharField(max_length=255, null=True, blank=True)

    def __str__(self):
        return f"Invite from {self.from_user} to {self.to_user} - {self.status}"

class Tournament(models.Model):
    class TournamentStatusChoices(models.TextChoices):
        PENDING = 'pending', 'Pending'
        IN_PROGRESS = 'in_progress', 'In Progress'
        COMPLETED = 'completed', 'Completed'
        CANCELLED = 'cancelled', 'Cancelled'

    id = models.AutoField(primary_key=True)
    tournament_name = models.CharField(max_length=255, default="Unnamed Tournament")
    status = models.CharField(max_length=15, choices=TournamentStatusChoices.choices, default=TournamentStatusChoices.PENDING)
    creator = models.ForeignKey(Users, on_delete=models.CASCADE, related_name='created_tournaments', help_text="The user who created the tournament")
    participants = models.ManyToManyField(Users, related_name='tournaments_participated', help_text="The 4 players in the tournament")
    semifinal_1 = models.OneToOneField('Match', on_delete=models.SET_NULL, related_name='tournament_semifinal_1', null=True, blank=True, help_text="First semifinal match")
    semifinal_2 = models.OneToOneField('Match', on_delete=models.SET_NULL, related_name='tournament_semifinal_2', null=True, blank=True, help_text="Second semifinal match")
    final = models.OneToOneField('Match', on_delete=models.SET_NULL, related_name='tournament_final', null=True, blank=True, help_text="Final match")
    champion = models.ForeignKey(Users, on_delete=models.SET_NULL, related_name='tournaments_won', null=True, blank=True, help_text="The winner of the tournament")
    creation_date = models.DateTimeField(auto_now_add=True)
    completion_date = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.tournament_name} ({self.status}) - Created: {self.creation_date}"

    class Meta:
        ordering = ['-creation_date']