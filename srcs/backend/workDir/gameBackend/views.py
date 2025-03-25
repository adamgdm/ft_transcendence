from django.shortcuts import render
from django.http import JsonResponse, HttpRequest
from .models import Match, GameInvites
from authentication.decorators import check_auth
from authentication.models import Users
from django.views.decorators.csrf import csrf_exempt
from asgiref.sync import sync_to_async
from channels.db import database_sync_to_async
import time
import asyncio
import random
import json

games = {}


def create_new_game(player_1, player_2=None, game_opponent='local'):
    return {
        'ball_x': 0.5,
        'ball_y': 0.5,
        'ball_bounds': 0.01,
        'ball_speed_x': random.choice([-0.011, 0.011]),
        'ball_speed_y': random.choice([-0.007, 0.007]),
        'paddle1_x': 0.02,
        'paddle2_x': 0.98,
        'paddle1_y': 0.5,
        'paddle2_y': 0.5,
        'paddle_bounds_x': 0.02,
        'paddle_bounds_y': 0.1,
        'paddle_speed': 0.02,
        'last_score1': 0,
        'last_score2': 0,
        'score1': 0,
        'score2': 0,
        'player_1': player_1,
        'player_2': player_2,
        'player1_status': 'offline', # offline, online
        'player2_status': 'offline', # offline, online
        'game_opponent': game_opponent,
        'status': 'Playing' # Playing, Done
    }

@csrf_exempt
@check_auth
def create_game(request):
    global games
    if request.method == 'POST':
        player = request.POST.get('player')
        user_id = Users.objects.get(id=request.user_id)

        if not player:
            player = None

        game_name = request.POST.get('game_name', 'Untitled Game')
        
        if player:
            try:
                player = Users.objects.filter(user_name=player).first()
                if not player:
                    return JsonResponse({'error': 'Player 2 not found'}, status=404)
                game_opponent = 'online'
            except:
                return JsonResponse({'error': 'Player 2 not found'}, status=404)
        else:
            player = user_id
            game_opponent = 'local'

        try:
            game = Match.objects.create(
                match_name=game_name,
                player_1=user_id,
                player_2=player,
                game_opponent=game_opponent
            )
            user_id.matches_played += 1
            user_id.save()
            if game_opponent != 'local':
                player.matches_played += 1
                user_id.matches_played += 1
                player.save()
                user_id.save()
            game_id = str(game.id) 
            games[game_id] = create_new_game(user_id.user_name, player.user_name, game_opponent)
            return JsonResponse({'message': 'Game created successfully', 'game_id': game_id, 'user': player.user_name}, status=201)
        except Exception as e:
            return JsonResponse({'error': f'Failed to create game: {str(e)}'}, status=500)
    
    return JsonResponse({'error': 'Invalid request'}, status=400)


@csrf_exempt
@check_auth
def send_game_invite(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            to_username = data.get('to_username')
            game_mode = data.get('game_mode')
            if not to_username or not game_mode:
                return JsonResponse({'error': 'Missing fields (to_username or game_mode)'}, status=400)
        except (json.JSONDecodeError, KeyError):
            return JsonResponse({'error': 'Invalid request format'}, status=400)

        # Validate game_mode
        if game_mode not in GameInvites.GameModes.values:
            return JsonResponse({'error': 'Invalid game mode'}, status=400)

        try:
            to_user = Users.objects.get(user_name=to_username)
        except Users.DoesNotExist:
            return JsonResponse({'error': 'User not found'}, status=404)

        from_user = Users.objects.get(id=request.user_id)

        # Prevent self-invites
        if from_user == to_user:
            return JsonResponse({'error': 'Cannot send game invite to yourself'}, status=400)

        # Check if an invite already exists
        if GameInvites.objects.filter(from_user=from_user, to_user=to_user, status=GameInvites.GameInviteStatus.PENDING).exists():
            return JsonResponse({'error': 'Game invite already pending'}, status=400)

        # Create the invite
        invite = GameInvites.objects.create(
            from_user=from_user,
            to_user=to_user,
            game_mode=game_mode,
            status=GameInvites.GameInviteStatus.PENDING
        )

        # # Send WebSocket notification
        # channel_layer = get_channel_layer()
        # async_to_sync(channel_layer.group_send)(
        #     f"game_invite_group_{to_user.id}",
        #     {
        #         'type': 'game_invite_notification',
        #         'message': f'{from_user.user_name} has invited you to a {game_mode} game!',
        #         'from_user_id': from_user.id,
        #         'from_username': from_user.user_name,
        #         'invite_id': invite.id,
        #         'game_mode': game_mode
        #     }
        # )

        return JsonResponse({'message': 'Game invite sent successfully', 'invite_id': invite.id}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
@check_auth
def cancel_game_invite(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            invite_id = data.get('invite_id')
            if not invite_id:
                return JsonResponse({'error': 'Missing invite_id'}, status=400)
        except (json.JSONDecodeError, KeyError):
            return JsonResponse({'error': 'Invalid request format'}, status=400)

        from_user = Users.objects.get(id=request.user_id)

        try:
            invite = GameInvites.objects.get(id=invite_id, from_user=from_user, status=GameInvites.GameInviteStatus.PENDING)
        except GameInvites.DoesNotExist:
            return JsonResponse({'error': 'Pending game invite not found or not yours to cancel'}, status=404)

        to_user = invite.to_user
        invite.delete()

        # # Notify the recipient
        # channel_layer = get_channel_layer()
        # async_to_sync(channel_layer.group_send)(
        #     f"game_invite_group_{to_user.id}",
        #     {
        #         'type': 'game_invite_update',
        #         'message': f'{from_user.user_name} canceled their game invite.',
        #         'from_user_id': from_user.id
        #     }
        # )

        return JsonResponse({'message': 'Game invite canceled successfully'}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
@check_auth
def accept_game_invite(request):
    global games
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            invite_id = data.get('invite_id')
            if not invite_id:
                return JsonResponse({'error': 'Missing invite_id'}, status=400)
        except (json.JSONDecodeError, KeyError):
            return JsonResponse({'error': 'Invalid request format'}, status=400)

        # Get the authenticated user (recipient)
        to_user = Users.objects.get(id=request.user_id)

        # Fetch the invite
        try:
            invite = GameInvites.objects.get(id=invite_id, to_user=to_user, status=GameInvites.GameInviteStatus.PENDING)
        except GameInvites.DoesNotExist:
            return JsonResponse({'error': 'Pending game invite not found'}, status=404)

        from_user = invite.from_user

        # Create the game directly
        game_opponent = 'online'
        game_name = f"{from_user.user_name} vs {to_user.user_name}"

        try:
            game = Match.objects.create(
                match_name=game_name,
                player_1=to_user,  # The accepting user is player_1
                player_2=from_user,  # The inviter is player_2
                game_opponent=game_opponent
            )
            game_id = str(game.id)
            games[game_id] = create_new_game(to_user.user_name, from_user.user_name, game_opponent)
        except Exception as e:
            return JsonResponse({'error': f'Failed to create game: {str(e)}'}, status=500)

        # Update the invite with game_id and status
        invite.status = GameInvites.GameInviteStatus.ACCEPTED
        invite.game_id = game_id
        invite.save()

        return JsonResponse({
            'message': 'Game invite accepted and game created successfully',
            'game_id': game_id,
            'user': to_user.user_name  # Add the accepting user's username
        }, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

# Reject a Game Invite
@csrf_exempt
@check_auth
def reject_game_invite(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            invite_id = data.get('invite_id')
            if not invite_id:
                return JsonResponse({'error': 'Missing invite_id'}, status=400)
        except (json.JSONDecodeError, KeyError):
            return JsonResponse({'error': 'Invalid request format'}, status=400)

        to_user = Users.objects.get(id=request.user_id)

        try:
            invite = GameInvites.objects.get(id=invite_id, to_user=to_user, status=GameInvites.GameInviteStatus.PENDING)
        except GameInvites.DoesNotExist:
            return JsonResponse({'error': 'Pending game invite not found'}, status=404)

        from_user = invite.from_user
        invite.status = GameInvites.GameInviteStatus.REFUSED
        invite.save()

        # # Notify the sender
        # channel_layer = get_channel_layer()
        # async_to_sync(channel_layer.group_send)(
        #     f"game_invite_group_{from_user.id}",
        #     {
        #         'type': 'game_invite_update',
        #         'message': f'{to_user.user_name} rejected your {invite.game_mode} game invite.',
        #         'to_user_id': to_user.id,
        #         'invite_id': invite.id
        #     }
        # )

        return JsonResponse({'message': 'Game invite rejected successfully'}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

# Get Received Game Invites
@csrf_exempt
@check_auth
def get_game_invites_received(request):
    if request.method == 'GET':
        user = Users.objects.get(id=request.user_id)
        invites = GameInvites.objects.filter(
            to_user=user,
            status__in=[GameInvites.GameInviteStatus.PENDING, GameInvites.GameInviteStatus.ACCEPTED]
        )

        invites_list = [
            {
                'invite_id': invite.id,
                'from_user_id': invite.from_user.id,
                'from_username': invite.from_user.user_name,
                'game_mode': invite.game_mode,
                'status': invite.status,
                'issued_at': invite.issued_at.isoformat(),
                'game_id': invite.game_id  # Include game_id
            }
            for invite in invites
        ]

        return JsonResponse({'invites': invites_list}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

# Get Sent Game Invites
@csrf_exempt
@check_auth
def get_game_invites_sent(request):
    if request.method == 'GET':
        user = Users.objects.get(id=request.user_id)
        invites = GameInvites.objects.filter(
            from_user=user,
            status__in=[GameInvites.GameInviteStatus.PENDING, GameInvites.GameInviteStatus.ACCEPTED]
        )

        invites_list = [
            {
                'invite_id': invite.id,
                'to_user_id': invite.to_user.id,
                'to_username': invite.to_user.user_name,
                'game_mode': invite.game_mode,
                'status': invite.status,
                'issued_at': invite.issued_at.isoformat(),
                'game_id': invite.game_id  # Include game_id
            }
            for invite in invites
        ]

        return JsonResponse({'sent_invites': invites_list}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

# Get Game Invite Status
@csrf_exempt
@check_auth
def get_game_invite_status(request):
    if request.method == 'GET':
        invite_id = request.GET.get('invite_id', '').strip()
        if not invite_id:
            return JsonResponse({'error': 'Missing invite_id'}, status=400)

        user = Users.objects.get(id=request.user_id)

        try:
            invite = GameInvites.objects.get(id=invite_id)
        except GameInvites.DoesNotExist:
            return JsonResponse({'error': 'Game invite not found'}, status=404)

        # Ensure the user is involved in the invite
        if invite.from_user != user and invite.to_user != user:
            return JsonResponse({'error': 'Not authorized to view this invite'}, status=403)

        return JsonResponse({
            'invite_id': invite.id,
            'status': invite.status,
            'game_mode': invite.game_mode,
            'from_user_id': invite.from_user.id,
            'from_username': invite.from_user.user_name,
            'to_user_id': invite.to_user.id,
            'to_username': invite.to_user.user_name,
            'issued_at': invite.issued_at.isoformat(),
            'direction': 'sent' if invite.from_user == user else 'received'
        }, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

# Bulk Game Invite Status
@csrf_exempt
@check_auth
def bulk_game_invite_status(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            invite_ids = data.get('invite_ids', [])
            if not invite_ids:
                return JsonResponse({'error': 'No invite_ids provided'}, status=400)
        except (json.JSONDecodeError, KeyError):
            return JsonResponse({'error': 'Invalid request format'}, status=400)

        user = Users.objects.get(id=request.user_id)
        statuses = {}

        for invite_id in invite_ids:
            try:
                invite = GameInvites.objects.get(id=invite_id)
                if invite.from_user != user and invite.to_user != user:
                    statuses[invite_id] = {'status': 'unauthorized', 'direction': None}
                else:
                    statuses[invite_id] = {
                        'status': invite.status,
                        'game_mode': invite.game_mode,
                        'from_user_id': invite.from_user.id,
                        'from_username': invite.from_user.user_name,
                        'to_user_id': invite.to_user.id,
                        'to_username': invite.to_user.user_name,
                        'issued_at': invite.issued_at.isoformat(),
                        'direction': 'sent' if invite.from_user == user else 'received'
                    }
            except GameInvites.DoesNotExist:
                statuses[invite_id] = {'status': 'not_found', 'direction': None}

        return JsonResponse({'statuses': statuses}, status=200)
    return JsonResponse({'error': 'Invalid request method'}, status=405)

@csrf_exempt
@check_auth
def accept_game_invite_from_user(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            from_username = data.get('from_username')
            if not from_username:
                return JsonResponse({'error': 'Missing from_username'}, status=400)
        except (json.JSONDecodeError, KeyError):
            return JsonResponse({'error': 'Invalid request format'}, status=400)

        # Get the authenticated user (recipient)
        to_user = Users.objects.get(id=request.user_id)

        try:
            from_user = Users.objects.get(user_name=from_username)
        except Users.DoesNotExist:
            return JsonResponse({'error': 'User not found'}, status=404)

        # Look for a pending invite from from_user to to_user
        try:
            invite = GameInvites.objects.get(
                from_user=from_user,
                to_user=to_user,
                status=GameInvites.GameInviteStatus.PENDING
            )
        except GameInvites.DoesNotExist:
            return JsonResponse({'error': f'No pending game invite from {from_username}'}, status=404)

        # Accept the invite
        invite.status = GameInvites.GameInviteStatus.ACCEPTED
        invite.save()

        # # Notify the sender via WebSocket
        # channel_layer = get_channel_layer()
        # async_to_sync(channel_layer.group_send)(
        #     f"game_invite_group_{from_user.id}",
        #     {
        #         'type': 'game_invite_update',
        #         'message': f'{to_user.user_name} accepted your {invite.game_mode} game invite!',
        #         'to_user_id': to_user.id,
        #         'invite_id': invite.id
        #     }
        # )

        return JsonResponse({
            'message': f'Game invite from {from_username} accepted successfully',
            'invite_id': invite.id,
            'game_mode': invite.game_mode
        }, status=200)

    return JsonResponse({'error': 'Invalid request method'}, status=405)



















# ///////////////////////////////////////////////////////////////////////////////////////////////////
# ///////////////////////////////////////////////////////////////////////////////////////////////////
# ------------------------------------------  Game  Logic  ------------------------------------------
# ///////////////////////////////////////////////////////////////////////////////////////////////////
# ///////////////////////////////////////////////////////////////////////////////////////////////////

import random
import asyncio
from django.db.models import Q
from asgiref.sync import sync_to_async as database_sync_to_async
from .models import Match, Tournament
from blockchain.blockchainInterface import TournamentBlockchain

async def game_update(game_id):
    global games
    game_id = str(game_id)
    game_info = games[game_id]

    # Initialize game state
    if 'score1' not in game_info:
        game_info['score1'] = 0
    if 'score2' not in game_info:
        game_info['score2'] = 0
    if 'last_score1' not in game_info:
        game_info['last_score1'] = game_info['score1']
    if 'last_score2' not in game_info:
        game_info['last_score2'] = game_info['score2']

    # Update ball position
    game_info['ball_x'] += game_info['ball_speed_x']
    game_info['ball_y'] += game_info['ball_speed_y']

    # Scoring
    if game_info['ball_x'] < game_info['paddle1_x'] - game_info['paddle_bounds_x']:
        game_info['score2'] += 1
        await game_reset(game_id)
    elif game_info['ball_x'] > game_info['paddle2_x'] + game_info['paddle_bounds_x']:
        game_info['score1'] += 1
        await game_reset(game_id)

    # Check for game completion and update database
    if game_info['score1'] >= 7 or game_info['score2'] >= 7:
        def sync_save_match_completion():
            # Initialize blockchain instance
            blockchain = TournamentBlockchain()

            pongMatch = Match.objects.select_related('player_1', 'player_2', 'match_winner', 'match_loser').get(id=game_id)
            pongMatch.score_player_1 = game_info['score1']
            pongMatch.score_player_2 = game_info['score2']
            if game_info['score1'] >= 7:
                pongMatch.match_winner = pongMatch.player_1
                pongMatch.match_loser = pongMatch.player_2
            else:
                pongMatch.match_winner = pongMatch.player_2
                pongMatch.match_loser = pongMatch.player_1
            if pongMatch.game_opponent != 'local':
                winner = pongMatch.match_winner
                loser = pongMatch.match_loser
                winner.matches_played += 1
                loser.matches_played += 1
                winner.matches_won += 1
                winner.win_ratio = (winner.matches_won / winner.matches_played) * 100 if winner.matches_played > 0 else 0
                loser.win_ratio = (loser.matches_won / loser.matches_played) * 100 if loser.matches_played > 0 else 0
                winner.save()
                loser.save()

            pongMatch.match_status = Match.MatchStatusChoices.DONE
            pongMatch.save()
            game_info['status'] = 'Done'

            tournament = Tournament.objects.filter(
                Q(semifinal_1=pongMatch) | Q(semifinal_2=pongMatch) | Q(final=pongMatch)
            ).first()
            if tournament:
                # Only update blockchain if blockchain_match_id exists
                if pongMatch.blockchain_match_id:
                    try:
                        blockchain.updateMatchScore(
                            tournament.blockchain_tournament_id,
                            pongMatch.blockchain_match_id,
                            pongMatch.score_player_1,
                            pongMatch.score_player_2
                        )
                        logger.info(f"[{game_id}] Blockchain updated: Tournament {tournament.blockchain_tournament_id}, Match {pongMatch.blockchain_match_id}, Scores: {pongMatch.score_player_1}-{pongMatch.score_player_2}")
                    except Exception as e:
                        logger.error(f"[{game_id}] Failed to update blockchain: {e}")
                else:
                    logger.warning(f"[{game_id}] Skipping blockchain update: Match {pongMatch.id} has no blockchain_match_id")

                game_info['tournament_id'] = str(tournament.id)
                game_info['report_result'] = True

            print(f"[{game_id}] Saved match: Winner={pongMatch.match_winner}, Status={pongMatch.match_status}")

        try:
            await database_sync_to_async(sync_save_match_completion)()
        except Exception as e:
            print(f"[{game_id}] Failed to save match completion: {e}")
        return game_info

    # Update scores to DB if changed
    if game_info['score1'] != game_info['last_score1'] or game_info['score2'] != game_info['last_score2']:
        def sync_save_scores():
            pongMatch = Match.objects.select_related('player_1', 'player_2').get(id=game_id)
            pongMatch.score_player_1 = game_info['score1']
            pongMatch.score_player_2 = game_info['score2']
            pongMatch.save(update_fields=['score_player_1', 'score_player_2'])  # Limit fields to avoid signal triggers
            game_info['last_score1'] = game_info['score1']
            game_info['last_score2'] = game_info['score2']

        try:
            await database_sync_to_async(sync_save_scores)()
            await asyncio.sleep(1)  # Brief pause for intermediate scores
        except Exception as e:
            print(f"[{game_id}] Failed to update intermediate scores: {e}")

    # Wall collision
    if game_info['ball_y'] < game_info['ball_bounds']:
        game_info['ball_y'] = game_info['ball_bounds']
        game_info['ball_speed_y'] = -abs(game_info['ball_speed_y']) if game_info['ball_speed_y'] > 0 else 0.007
        return game_info
    elif game_info['ball_y'] > 1 - game_info['ball_bounds']:
        game_info['ball_y'] = 1 - game_info['ball_bounds']
        game_info['ball_speed_y'] = -abs(game_info['ball_speed_y']) if game_info['ball_speed_y'] < 0 else -0.007
        return game_info
    
    # Paddle collision
    if (game_info['ball_x'] >= game_info['paddle1_x'] and 
        game_info['ball_x'] < game_info['paddle1_x'] + game_info['paddle_bounds_x'] and 
        game_info['paddle1_y'] - game_info['paddle_bounds_y'] < game_info['ball_y'] < game_info['paddle1_y'] + game_info['paddle_bounds_y']):
        game_info['ball_speed_x'] = -game_info['ball_speed_x']
        game_info['ball_speed_y'] = (game_info['ball_y'] - game_info['paddle1_y']) * 0.2
        return game_info
    elif (game_info['ball_x'] <= game_info['paddle2_x'] and 
          game_info['ball_x'] > game_info['paddle2_x'] - game_info['paddle_bounds_x'] and 
          game_info['paddle2_y'] - game_info['paddle_bounds_y'] < game_info['ball_y'] < game_info['paddle2_y'] + game_info['paddle_bounds_y']):
        game_info['ball_speed_x'] = -game_info['ball_speed_x']
        game_info['ball_speed_y'] = (game_info['ball_y'] - game_info['paddle2_y']) * 0.2

    return game_info

async def game_reset(game_id):
    game_info = games[str(game_id)]
    game_info['ball_x'] = 0.5
    game_info['ball_y'] = 0.5
    game_info['ball_speed_x'] = random.choice([-0.011, 0.011])
    game_info['ball_speed_y'] = random.choice([-0.007, 0.007])
    game_info['paddle1_y'] = 0.5
    game_info['paddle2_y'] = 0.5