from django.shortcuts import render
from django.http import JsonResponse
from .models import Match
from authentication.decorators import check_auth
from authentication.models import Users
from django.views.decorators.csrf import csrf_exempt
from asgiref.sync import sync_to_async
import random
import json

games = {}

def create_new_game(player_1, player_2=None, game_opponent='same_computer'):
    return {
        'ball_x': 0.5,
        'ball_y': 0.5,
        'ball_bounds': 0.02,
        'ball_speed_x': random.choice([-0.01, 0.01]), # increased to compensate for reduced frame rate
        'ball_speed_y': random.choice([-0.006, 0.006]),
        'paddle1_x': 0.03,
        'paddle2_x': 0.97,
        'paddle1_y': 0.5,
        'paddle2_y': 0.5,
        'paddle_bounds_x': 0.04,
        'paddle_bounds_y': 0.2,
        'paddle_speed': 0.02,
        'score1': 0,
        'score2': 0,
        'player_1': player_1,
        'player_2': player_2,
        'game_opponent': game_opponent,
        'status': 'Playing' # Playing, Done
    }

@csrf_exempt
@check_auth
def create_game(request):
    global games
    if request.method == 'POST':
        if 'player_1' not in request.POST:
            return JsonResponse({'error': 'At least one player is required'}, status=400)
        
        player_1 = request.POST.get('player_1')
        player_2 = None
        game_opponent = None

        if 'player_2' in request.POST and 'game_opponent' in request.POST:
            if request.POST.get('game_opponent') not in ['same_computer', 'ai']:
                return JsonResponse({'error': 'Invalid game opponent'}, status=400)

        if 'player_2' in request.POST:
            player_2 = request.POST.get('player_2')
        elif 'game_opponent' in request.POST:
            game_opponent = request.POST.get('game_opponent')
            if game_opponent not in ['same_computer', 'ai']:
                return JsonResponse({'error': 'Invalid game opponent'}, status=400)

        game_name = request.POST.get('game_name', 'Untitled Game')
        
        try:
            user_1 = Users.objects.filter(user_name=player_1).first()
            if not user_1:
                return JsonResponse({'error': 'Player 1 not found'}, status=404)
        except:
            return JsonResponse({'error': 'Player 1 not found'}, status=404)

        if player_2:
            try:
                user_2 = Users.objects.filter(user_name=player_2).first()
                if not user_2:
                    return JsonResponse({'error': 'Player 2 not found'}, status=404)
            except:
                return JsonResponse({'error': 'Player 2 not found'}, status=404)
        else:
            user_2 = user_1

        try:
            game = Match.objects.create(
                match_name=game_name,
                player_1=user_1,
                player_2=user_2,
            )
            game_id = str(game.id) 
            games[game_id] = create_new_game(player_1, player_2, game_opponent)
            return JsonResponse({'message': 'Game created successfully', 'game_id': game_id}, status=201)
        except Exception as e:
            return JsonResponse({'error': f'Failed to create game: {str(e)}'}, status=500)
    
    return JsonResponse({'error': 'Invalid request'}, status=400)

def game_render(request):
    return render(request, 'Visuals/game.html')

@csrf_exempt
@check_auth
def get_game_state(request):
    global games
    print(games)
    if request.method == 'POST':
        try:
            body = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

        game_id = str(body.get('game_id'))
        if not game_id:
            return JsonResponse({'error': 'game_id is required'}, status=400)

        game_state = games.get(game_id)
        if not game_state:
            return JsonResponse({'error': 'Game not found'}, status=404)

        game_update(game_id)

        game_state['game_id'] = game_id

        return JsonResponse(game_state)
    return JsonResponse({'error': 'Invalid request'}, status=400)

@csrf_exempt
@check_auth
def game_action(request):
    global games
    if request.method == 'POST':
        if 'game_id' not in request.POST:
            return JsonResponse({'error': 'game_id is required'}, status=400)
        if 'action' not in request.POST:
            return JsonResponse({'error': 'action is required'}, status=400)
        game_id = str(request.POST.get('game_id')) 
        action = request.POST.get('action')

        if not game_id:
            return JsonResponse({'error': 'game_id is required'}, status=400)
        if not action:
            return JsonResponse({'error': 'action is required'}, status=400)
        
        if game_id not in games:
            return JsonResponse({'error': 'Game not found'}, status=404)
        
        if action == 'reset':
            game_reset(game_id)
        elif action == 'update':
            game_state = game_update(game_id)
            return JsonResponse(game_state, safe=False, status=200)
        
        return JsonResponse({})
    return JsonResponse({'error': 'Invalid request'}, status=400)

def game_reset(game_id):
    global games
    game_id = str(game_id) 
    if game_id not in games:
        return
    game_info = games[game_id]
    if game_info:
        # Reset only the necessary parts of the game state
        game_info['ball_x'] = 0.5 
        game_info['ball_y'] = 0.5 
        game_info['ball_speed_x'] = random.choice([-0.01, 0.01]) # Same as create_new_game, increased for reduced frame rate
        game_info['ball_speed_y'] = random.choice([-0.006, 0.006])
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

    # If ball hits paddle1
    if game_info['ball_x'] < game_info['paddle1_x'] + game_info['paddle_bounds_x']:
        if game_info['paddle1_y'] - game_info['paddle_bounds_y'] < game_info['ball_y'] < game_info['paddle1_y'] + game_info['paddle_bounds_y']:
            game_info['ball_speed_x'] = -game_info['ball_speed_x']
            game_info['ball_speed_y'] = (game_info['ball_y'] - game_info['paddle1_y']) * 0.03

    # If ball hits paddle2
    if game_info['ball_x'] > game_info['paddle2_x'] - game_info['paddle_bounds_x']:
        if game_info['paddle2_y'] - game_info['paddle_bounds_y'] < game_info['ball_y'] < game_info['paddle2_y'] + game_info['paddle_bounds_y']:
            game_info['ball_speed_x'] = -game_info['ball_speed_x']
            game_info['ball_speed_y'] = (game_info['ball_y'] - game_info['paddle2_y']) * 0.03
    
    # If ball goes out of bounds
    if game_info['ball_x'] < game_info['paddle1_x'] - game_info['paddle_bounds_x']:
        game_info['score2'] += 1
        print(f"Score updated: Player 2 scored. New score: {game_info['score2']}")
        game_reset(game_id)
   
    if game_info['ball_x'] > game_info['paddle2_x'] + game_info['paddle_bounds_x']:
        game_info['score1'] += 1
        print(f"Score updated: Player 1 scored. New score: {game_info['score1']}")
        game_reset(game_id)

    if game_info['score1'] == 7 or game_info['score2'] == 7:
        if game_info['score1'] == 7:
            pongMatch.match_winner = await sync_to_async(lambda: pongMatch.player_1)()
            pongMatch.match_loser = await sync_to_async(lambda: pongMatch.player_2)()
        elif game_info['score2'] == 7:
            pongMatch.match_winner = await sync_to_async(lambda: pongMatch.player_2)()
            pongMatch.match_loser = await sync_to_async(lambda: pongMatch.player_1)()
        pongMatch.score_player_1 = game_info['score1']
        pongMatch.score_player_2 = game_info['score2']
        pongMatch.match_status = Match.MatchStatusChoices.DONE
        await sync_to_async(pongMatch.save)()
        print(f"Match completed: Player 2 won. Final score: {game_info['score1']} - {game_info['score2']}")
        game_info['status'] = 'Done' # Send the final game state
        return game_info

    # AI for player2 (opponent) - simple AI that can't lose lol
    if game_info['game_opponent'] == 'ai' and game_info['ball_speed_x'] > 0:
        if game_info['ball_y'] < game_info['paddle2_y']:
            game_info['paddle2_y'] = max(0, game_info['paddle2_y'] - game_info['paddle_speed'])
        elif game_info['ball_y'] > game_info['paddle2_y']:
            game_info['paddle2_y'] = min(1 - game_info['paddle_bounds_y'], game_info['paddle2_y'] + game_info['paddle_speed'])

    return game_info