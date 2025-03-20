from django.shortcuts import render
from django.http import JsonResponse
from .models import Match
from authentication.decorators import check_auth
from authentication.models import Users
from django.views.decorators.csrf import csrf_exempt
from asgiref.sync import sync_to_async
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

def game_reset(game_id):
    global games
    game_id = str(game_id) 
    if game_id not in games:
        return
    game_info = games[game_id]
    if game_info:
        game_info['ball_x'] = 0.5 
        game_info['ball_y'] = 0.5 
        game_info['ball_speed_x'] = random.choice([-0.011, 0.011]) 
        game_info['ball_speed_y'] = random.choice([-0.007, 0.007])
        game_info['paddle1_y'] = 0.5 
        game_info['paddle2_y'] = 0.5 

async def game_update(game_id):
    global games
    # Retrieve the game state (called from async function)
    pongMatch = await sync_to_async(Match.objects.get)(id=game_id)
    game_id = str(game_id) 
    if game_id not in games:
        return {'game_id': game_id, 'error': 'Game not found'}

    game_info = games[game_id]
    if not game_info:
        return {'error': 'Game not found'}

    game_info['ball_x'] += game_info['ball_speed_x']
    game_info['ball_y'] += game_info['ball_speed_y']

    # If ball hits top or bottom wall
    if game_info['ball_y'] < game_info['ball_bounds'] or game_info['ball_y'] > 1 - game_info['ball_bounds']:
        game_info['ball_speed_y'] = -game_info['ball_speed_y']

    # If ball hits paddle1 (left paddle)
    if game_info['ball_x'] < game_info['paddle1_x'] + game_info['paddle_bounds_x']:
        # Only bounce if the ball hasn’t passed behind paddle1
        if game_info['ball_x'] >= game_info['paddle1_x']:  # Ball must be at or in front of paddle1
            if game_info['paddle1_y'] - game_info['paddle_bounds_y'] < game_info['ball_y'] < game_info['paddle1_y'] + game_info['paddle_bounds_y']:
                game_info['ball_speed_x'] = -game_info['ball_speed_x']
                game_info['ball_speed_y'] = (game_info['ball_y'] - game_info['paddle1_y']) * 0.2

    # If ball hits paddle2 (right paddle)
    if game_info['ball_x'] > game_info['paddle2_x'] - game_info['paddle_bounds_x']:
        # Only bounce if the ball hasn’t passed behind paddle2
        if game_info['ball_x'] <= game_info['paddle2_x']:  # Ball must be at or behind paddle2
            if game_info['paddle2_y'] - game_info['paddle_bounds_y'] < game_info['ball_y'] < game_info['paddle2_y'] + game_info['paddle_bounds_y']:
                game_info['ball_speed_x'] = -game_info['ball_speed_x']
                game_info['ball_speed_y'] = (game_info['ball_y'] - game_info['paddle2_y']) * 0.2
    
    # If ball goes out of bounds (before bounce check)
    if game_info['ball_x'] < game_info['paddle1_x'] - game_info['paddle_bounds_x']:  
        game_info['score2'] += 1  # Player 2 scores
        print(f"Score updated: Player 2 scored. New score: {game_info['score2']}")
        game_reset(game_id)
        await asyncio.sleep(2)
        return game_info  # Return early to avoid further processing

    if game_info['ball_x'] > game_info['paddle2_x'] + game_info['paddle_bounds_x']:  
        game_info['score1'] += 1  # Player 1 scores
        print(f"Score updated: Player 1 scored. New score: {game_info['score1']}")
        game_reset(game_id)
        await asyncio.sleep(2)
        return game_info  # Return early to avoid further processing




    if game_info['score1'] == 7 or game_info['score2'] == 7:
        if game_info['score1'] == 7:
            game_opponent = await sync_to_async(lambda: pongMatch.game_opponent)()
            player1 = await sync_to_async(lambda: pongMatch.player_1)()
            player2 = await sync_to_async(lambda: pongMatch.player_2)()
            pongMatch.match_winner = player1
            pongMatch.match_loser = player2
            if game_opponent != 'local':
                player1.matches_won += 1
                player1.win_ratio = round((player1.matches_won / player1.matches_played) * 100)
                update_ppp_ratings(player1, player2, result=1)
                await sync_to_async(player1.save)()
                await sync_to_async(player2.save)()
        elif game_info['score2'] == 7:
            game_opponent = await sync_to_async(lambda: pongMatch.game_opponent)()
            player1 = await sync_to_async(lambda: pongMatch.player_1)()
            player2 = await sync_to_async(lambda: pongMatch.player_2)()
            pongMatch.match_winner = player2
            pongMatch.match_loser = player1
            if game_opponent != 'local':
                player2.matches_won += 1
                player2.win_ratio = round((player2.matches_won / player2.matches_played) * 100)
                update_ppp_ratings(player2, player1, result=1)
                await sync_to_async(player1.save)()
                await sync_to_async(player2.save)()
        pongMatch.score_player_1 = game_info['score1']
        pongMatch.score_player_2 = game_info['score2']
        pongMatch.match_status = Match.MatchStatusChoices.DONE
        await sync_to_async(pongMatch.save)()
        print(f"Match completed: Player 2 won. Final score: {game_info['score1']} - {game_info['score2']}")
        game_info['status'] = 'Done'

    return game_info

