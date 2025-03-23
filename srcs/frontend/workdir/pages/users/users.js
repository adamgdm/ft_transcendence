export function users() {
    const fullName = document.querySelector('[profileElement="fullName"]')
    const userName = document.querySelector('[profileElement="userName"]')
    const ppp_rating = document.querySelector('[profileElement="ppp_rating"]')
    const player_title = document.querySelector('[profileElement="player_title"]')
    const win_ratio = document.querySelector('[profileElement="win_ratio"]')
    const matches_played = document.querySelector('[profileElement="matches_played"]')
    const profile_pic = document.querySelector('[profileElement="picture"] img')
    
    // Parse the query parameter from the URL hash
    const hash = window.location.hash;
    const username = hash.split('=')[1]
    console.log(username);

    // ✅ Fetch the user profile
    if (username) {
        fetchUserProfile(username); // Fetch the user profile based on the username
    } else {
        console.log('Username not provided, loading 404');
        layoutShowError('User not found', false);
        window.history.back();
    }

    // Function to fetch user data from the backend
    function fetchUserProfile(username) {
        const url = `/api/another_user_profile/?username=${encodeURIComponent(username)}`;
        fetch(url, {
            method: "GET",
            credentials: "include" // Includes cookies/session data for authentication
        })
        .then(response => {
            if (!response.ok) {
                console.log('fetchUserProfile: User not found');
                layoutShowError('User not found', false);
                window.history.back();
            }   
            return response.json();
        })
        .then(userData => {
            console.log('User Data:', userData);

            // Check if the backend explicitly says "user not found"
            if (userData.error === 'User not found') {
                console.log('fetchUserProfile: Backend returned User not found"');
                layoutShowError('User not found', false);
                window.history.back();
            } else {
                // If user is found, update the UI
                updateUserProfileUI(userData);
            }
        })
        .catch(error => {
            console.error('Error:', error);
        });
    }

    // Function to update the UI with the fetched user data
    function updateUserProfileUI(userData) {
        if (fullName) {
            fullName.textContent = `${userData.first_name} ${userData.last_name}`;
        }
        if (userName) {
            userName.textContent = userData.user_name;
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
            if (!userData.has_42_image && !userData.has_profile_pic) {
                image_path = "https://articles-images.sftcdn.net/wp-content/uploads/sites/3/2016/01/wallpaper-for-facebook-profile-photo.jpg";
            } else if (userData.has_42_image && !userData.has_profile_pic) {
                image_path = userData.profile_pic_42;
            } else if (!userData.has_42_image && userData.has_profile_pic) {
                image_path = userData.profile_picture_url;
            }
            profile_pic.src = image_path;
        }
    }
}