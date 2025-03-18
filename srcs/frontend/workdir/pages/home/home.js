export function home() {
    const fullName = document.querySelector('[profileElement="fullName"]')
    const userName = document.querySelector('[profileElement="userName"]')
    const ppp_rating = document.querySelector('[profileElement="ppp_rating"]')
    const player_title = document.querySelector('[profileElement="player_title"]')
    const win_ratio = document.querySelector('[profileElement="win_ratio"]')
    const matches_played = document.querySelector('[profileElement="matches_played"]')
    
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
        if(ppp_rating) {
            ppp_rating.textContent = userData.ppp_rating;
        }
        if(player_title) {
            player_title.textContent = userData.title;
        }
        if(win_ratio) {
            win_ratio.textContent = userData.win_ratio;
        }
        if(matches_played) {
            matches_played.textContent = userData.matches_played;
        }
    })
    .catch(error => {
        console.error('Error:', error);
    });

}