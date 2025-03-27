import { pageCleanups, fetchFriendsList, friendsList as globalFriendsList, removeFriend } from "../../routing.js";

function createMatchElement(yourData, opponentData) {
    // main match container
    const matchDiv = document.createElement('div');
    matchDiv.className = 'match';
    matchDiv.setAttribute('match', 'last');
    
    //"you" player section
    const youPlayerDiv = document.createElement('div');
    youPlayerDiv.className = 'player';
    youPlayerDiv.setAttribute('player', 'you');

    const youPicDiv = document.createElement('div');
    youPicDiv.className = 'pic';
    
    const youImg = document.createElement('img');
    youImg.src = yourData.pic || 'default-image.jpg'; // provided pic or fallback
    youImg.alt = 'player image';
    
    const youName = document.createElement('h1');
    youName.className = 'user';
    youName.textContent = yourData.name || 'Unknown';
    
    const youScore = document.createElement('h1');
    youScore.className = 'score';
    youScore.textContent = yourData.score || 0;

    // "you" section
    youPicDiv.appendChild(youImg);
    youPlayerDiv.appendChild(youPicDiv);
    youPlayerDiv.appendChild(youName);
    youPlayerDiv.appendChild(youScore);

    // "opponent" player section
    const opponentPlayerDiv = document.createElement('div');
    opponentPlayerDiv.className = 'player';
    opponentPlayerDiv.setAttribute('player', 'opponent');

    const opponentScore = document.createElement('h1');
    opponentScore.className = 'score';
    opponentScore.textContent = opponentData.score || 0;
    
    const opponentName = document.createElement('h1');
    opponentName.className = 'user';
    opponentName.textContent = opponentData.name || 'Unknown';
    
    const opponentPicDiv = document.createElement('div');
    opponentPicDiv.className = 'pic';
    
    const opponentImg = document.createElement('img');
    opponentImg.src = opponentData.pic || 'default-image.jpg'; // Use provided pic or fallback
    opponentImg.alt = 'player image';

    // Assemble "opponent" section
    opponentPicDiv.appendChild(opponentImg);
    opponentPlayerDiv.appendChild(opponentScore);
    opponentPlayerDiv.appendChild(opponentName);
    opponentPlayerDiv.appendChild(opponentPicDiv);

    // Assemble full match
    matchDiv.appendChild(youPlayerDiv);
    matchDiv.appendChild(opponentPlayerDiv);
    return matchDiv;
}

export function home() {
    const fullName = document.querySelector('[profileElement="fullName"]');
    const userName = document.querySelector('[profileElement="userName"]');
    const ppp_rating = document.querySelector('[profileElement="ppp_rating"]');
    const player_title = document.querySelector('[profileElement="player_title"]');
    const win_ratio = document.querySelector('[profileElement="win_ratio"]');
    const matches_played = document.querySelector('[profileElement="matches_played"]');
    const profile_pic = document.querySelector('[profileElement="picture"] img');
    const planet = document.querySelector('[profileElement="Planet"] img');
    // Use the global friendsList from routing.js
    let friendsList = globalFriendsList; // Reference the exported friendsList
    let allFriends = [];

    function setupFriendsModal() {
        let modal = null;
        let friendsListContainer = null;
        let searchBar = null;
        let closeBtn = null;

        let cleanupFriendsModal = () => {};

        function initializeModal() {
            const seeFriendsBtn = document.querySelector('.see-friends-btn');
            if (!seeFriendsBtn) {
                console.warn('setupFriendsModal: .see-friends-btn not found, modal not initialized');
                return;
            }

            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'friends-modal';
                modal.classList.add('friends-modal');
                modal.innerHTML = `
                    <button class="close-btn">×</button>
                    <div class="search-bar-container">
                        <input type="text" class="search-bar" placeholder="Search friends...">
                    </div>
                    <div class="friends-list"></div>
                `;
                document.body.appendChild(modal);

                closeBtn = modal.querySelector('.close-btn');
                searchBar = modal.querySelector('.search-bar');
                friendsListContainer = modal.querySelector('.friends-list');
            }

            const openModal = async () => {
                try {
                    const friends = await fetchFriendsList();
                    friendsList.clear(); // Clear and repopulate from server
                    friends.forEach(f => friendsList.add(f.username));
                    renderFriends([...friendsList]);

                    modal.style.opacity = '1';
                    modal.style.visibility = 'visible';
                } catch (error) {
                    console.error('setupFriendsModal: Error fetching friends:', error);
                    friendsListContainer.innerHTML = '<p>Error loading friends.</p>';
                }
            };

            const closeModal = () => {
                modal.style.opacity = '0';
                modal.style.visibility = 'hidden';
                searchBar.value = '';
                renderFriends([...friendsList]);
            };

            const debounce = (func, wait) => {
                let timeout;
                return (...args) => {
                    clearTimeout(timeout);
                    timeout = setTimeout(() => func.apply(this, args), wait);
                };
            };

            const handleSearch = debounce(() => {
                const query = searchBar.value.trim().toLowerCase();
                const filteredFriends = [...friendsList].filter(friend =>
                    friend.toLowerCase().startsWith(query)
                );
                renderFriends(filteredFriends);
            }, 300);

            seeFriendsBtn.addEventListener('click', openModal);
            closeBtn.addEventListener('click', closeModal);
            searchBar.addEventListener('input', handleSearch);

            function renderFriends(friends) {
                friendsListContainer.innerHTML = '';
                if (!friends || friends.length === 0) {
                    friendsListContainer.innerHTML = '<p>No friends found.</p>';
                    return;
                }

                friends.forEach(friend => {
                    const friendItem = document.createElement('div');
                    friendItem.classList.add('friend-item');
                    friendItem.innerHTML = `
                        <img src="https://cdn-icons-png.flaticon.com/512/147/147144.png" alt="${friend} image">
                        <p>${friend}</p>
                        <button class="remove-friend">Remove Friend</button>
                    `;

                    const removeBtn = friendItem.querySelector('.remove-friend');
                    removeBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        try {
                            const result = await removeFriend(friend);
                            if (!result.error) {
                                friendsList.delete(friend);
                                const filtered = [...friendsList].filter(f =>
                                    f.toLowerCase().startsWith(searchBar.value.trim().toLowerCase())
                                );
                                renderFriends(filtered);
                            } else {
                                console.error('setupFriendsModal: Remove friend failed:', result.error);
                            }
                        } catch (error) {
                            console.error('setupFriendsModal: Error removing friend:', error);
                        }
                    });

                    friendsListContainer.appendChild(friendItem);
                });
            }

            cleanupFriendsModal = () => {
                seeFriendsBtn.removeEventListener('click', openModal);
                if (modal) {
                    closeBtn.removeEventListener('click', closeModal);
                    searchBar.removeEventListener('input', handleSearch);
                    modal.style.opacity = '0';
                    modal.style.visibility = 'hidden';
                    friendsListContainer.innerHTML = '';
                    modal.remove();
                    modal = null;
                }
                console.log('setupFriendsModal: Cleaned up');
            };
        }

        initializeModal();
        pageCleanups.set('home', cleanupFriendsModal);
    }

    fetch('/api/profile/', {
        method: "GET",
        credentials: "include"
    })
    .then(response => {
        if (response.status != 200) {
            throw new Error('Network response was not ok: ' + response.status);
        }
        return response.json(); 
    })
    .then(userData => {
        console.log('User Data:', userData);
        
        if (fullName) {
            fullName.textContent = `${userData.first_name} ${userData.last_name}`;
        }
        if (userName) {
            userName.textContent = userData.user_name;
        }
        if (planet) {
            planet.src = userData.planet;
        }
        if (ppp_rating) {
            ppp_rating.textContent = userData.ppp_rating;
        }

        if (player_title) {
            player_title.textContent = userData.title;
        }
        if (win_ratio) {
            win_ratio.textContent = userData.win_ratio;
        }
        if (matches_played) {
            matches_played.textContent = userData.matches_played;
        }
        if (profile_pic) {
            let image_path;
            if (userData.has_42_image == false && userData.has_profile_pic == false) {
                image_path = "https://articles-images.sftcdn.net/wp-content/uploads/sites/3/2016/01/wallpaper-for-facebook-profile-photo.jpg";
            } else if (userData.has_42_image == true && userData.has_profile_pic == false) {
                image_path = userData.profile_pic_42;
            } else {
                image_path = userData.profile_picture_url.url;//
            }
            profile_pic.src = image_path;
        }
        const matchContainer = document.querySelector('.user-match-history');
        
        // Check if matches_history exists and has entries
        if (userData.matches_history && userData.matches_history.length > 0) {
            // Loop through all matches
            userData.matches_history.forEach((match, index) => {
                const first_player_data = {
                    pic: match.player_1.image_path || 'https://articles-images.sftcdn.net/wp-content/uploads/sites/3/2016/01/wallpaper-for-facebook-profile-photo.jpg', // Fallback if image_path is missing
                    name: match.player_1.user_name || 'Unknown',
                    score: match.score_player_1 || 0
                };

                const opponent_data = {
                    pic: match.player_2.image_path || 'https://articles-images.sftcdn.net/wp-content/uploads/sites/3/2016/01/wallpaper-for-facebook-profile-photo.jpg', // Fallback if image_path is missing
                    name: match.player_2.user_name || 'Unknown',
                    score: match.score_player_2 || 0
                };

                // Create and append match element
                const matchElement = createMatchElement(first_player_data, opponent_data);
                matchContainer.appendChild(matchElement);
            });
        } else {
            // Handle case where there are no matches
            const noMatches = document.createElement('p');
            noMatches.textContent = 'No match history available.';
            matchContainer.appendChild(noMatches);
        }
        // const latestMatch = userData.matches_history[0];
        // const first_player_data = {
        //     pic: latestMatch.player_1.image_path,//needs work and connecting with image_path
        //     name: latestMatch.player_1.user_name,
        //     score: latestMatch.score_player_1
        // };

        // const opponent_data = {
        //     pic: latestMatch.player_2.image_path,//Needs more checks
        //     name: latestMatch.player_2.user_name,
        //     score: latestMatch.score_player_2
        // };
        // const matchContainer = document.querySelector('.user-match-history');    
        // const matchElement = createMatchElement(first_player_data, opponent_data);
        // matchContainer.appendChild(matchElement);
        setupFriendsModal(); // Call after profile data is loaded
    })
    .catch(error => {
        console.error('Error:', error);
    });

    // Return cleanup function for executePageScripts
    return () => {
        console.log('Cleaned up home page');
    };
}