let ppp_rating = null;
let original_image = "https://articles-images.sftcdn.net/wp-content/uploads/sites/3/2016/01/wallpaper-for-facebook-profile-photo.jpg";
let is_first_run = true;

export async function shop() {
    // This is a placeholder function for buying a planet
    // In a real application, this would interact with a backend service
    async function fetchUserProfile(){
        await fetch('/api/profile/', {
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
            console.log(userData);
            ppp_rating = userData.ppp_rating;
            if(is_first_run){
                if (userData.has_42_image == false && userData.has_profile_pic == false) {
                    original_image = "https://articles-images.sftcdn.net/wp-content/uploads/sites/3/2016/01/wallpaper-for-facebook-profile-photo.jpg";
                } else if (userData.has_42_image == true && userData.has_profile_pic == false) {
                    original_image = userData.profile_pic_42;
                } else {
                    original_image = userData.profile_picture_url.url;
                }
            }
            is_first_run = false;
        })
        .catch(error => {
            console.error('Error:', error);
        })
    }
    await fetchUserProfile();
    const avatarConfig = [
        {
            name: 'voidborn',
            displayName: 'L.voidborn',
            imagePath: 'assets/avatars/voidborn.svg',
            planetName: 'p.alpha',
            planetImage: 'assets/planets/alpha.svg',
            pppRequired: 3000,
            category: 'legendary'
        },
        {
            name: 'nova',
            displayName: 'C.nova',
            imagePath: 'assets/avatars/nova.svg',
            planetName: 'p.beta',
            planetImage: 'assets/planets/beta.svg',
            pppRequired: 2800,
        },
        {
            name: 'orion',
            displayName: 'C.orion',
            imagePath: 'assets/avatars/orion.svg',
            planetName: 'p.gamma',
            planetImage: 'assets/planets/gamma.svg',
            pppRequired: 0,
        },
        {
            name: 'vega',
            displayName: 'C.vega',
            imagePath: 'assets/avatars/vega.svg',
            planetName: 'p.delta',
            planetImage: 'assets/planets/delta.svg',
            pppRequired: 0,
        },
        {
            name: 'nebula',
            displayName: 'C.nebula',
            imagePath: 'assets/avatars/nebula.svg',
            planetName: 'p.epsilon',
            planetImage: 'assets/planets/epsilon.svg',
            pppRequired: 0,
        },
        {
            name: 'user',
            displayName: 'C.user',
            imagePath: original_image,
            planetName: 'p.zeta',
            planetImage: 'assets/planets/zeta.svg',
            pppRequired: 0,
        }
    ];
    
    function generateAvatarItems(avatarsContainer, config) {
        // Clear existing content
        avatarsContainer.innerHTML = '';
        
        // Create avatar items for each configuration
        config.forEach(avatar => {
            // Create main container
            const avatarItem = document.createElement('div');
            avatarItem.classList.add('avatar-item');

            // Create image
            const img = document.createElement('img');
            img.src = avatar.imagePath;
            img.alt = avatar.name;
            
            // Create info div
            const avatarInfo = document.createElement('div');
            avatarInfo.classList.add('avatar-info');
            avatarInfo.dataset.name = avatar.name;
            
            // Create title
            const title = document.createElement('h3');
            title.textContent = avatar.displayName;
            
            // Create PPP requirement text
            const pppText = document.createElement('p');
            pppText.textContent = `PPP Required: ${avatar.pppRequired} PPP or plus...`;
            
            const planetText = document.createElement('p');
            planetText.textContent = `Your new planet`;

            const planetImage = document.createElement('img');
            planetImage.src = avatar.planetImage;
            planetImage.alt = avatar.planetName;
            // Create buy button
            const buyButton = document.createElement('button');
            buyButton.classList.add('buy-button');
            buyButton.textContent = 'Buy';
            
            // Assemble the structure
            avatarInfo.appendChild(title);
            avatarInfo.appendChild(pppText);
            avatarInfo.appendChild(buyButton);
            avatarInfo.appendChild(planetText);
            avatarInfo.appendChild(planetImage);
            
            avatarItem.appendChild(img);
            avatarItem.appendChild(avatarInfo);
            
            // Add to container
            avatarsContainer.appendChild(avatarItem);
        });
    }
    const avatarsContainer = document.querySelector('.avatars-container');
    generateAvatarItems(avatarsContainer, avatarConfig);
    const avatarPPPRequirements = {};
    avatarConfig.forEach(avatar => {
        avatarPPPRequirements[avatar.name] = avatar.pppRequired;
    });
    const avatarImage = {};
    avatarConfig.forEach(avatar => {
        avatarImage[avatar.name] = avatar.imagePath;
    });
    const planetImage = {};
    avatarConfig.forEach(avatar =>{
        planetImage[avatar.name] = avatar.planetImage;
    })
    
    async function updateUserAvatar(avatarName, avatarPic, planetPic){
        try {
            const response = await fetch('/api/update_profile/', {
                method: "POST",
                credentials: "include",
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ profile_pic_42 : avatarPic , planet : planetPic})
            });
            
            if (!response.ok) {
                throw new Error('Failed to update avatar: ' + response.status);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error updating avatar:', error);
            return null;
        }
    }
    const buyButtons = document.querySelectorAll('.buy-button');
    // Function to handle the buy action
    function buy(event) {
        // Get the avatar name from the closest avatar-info div
        const avatarInfoDiv = event.target.closest('.avatar-item').querySelector('.avatar-info');
        const avatarName = avatarInfoDiv.dataset.name.toLowerCase();
        // Check if user has enough PPP
        const requiredPPP = avatarPPPRequirements[avatarName];
        const Avatarpic = avatarImage[avatarName];
        const planetPic = planetImage[avatarName];

        if (ppp_rating >= requiredPPP) {
            // Attempt to update the avatar
            const updateResult = updateUserAvatar(avatarName, Avatarpic, planetPic);
            
            if (updateResult) {
                // Success scenarios
                alert(`Successfully purchased ${avatarName} avatar!`);
                // Optional: update UI to show new avatar
                event.target.closest('.avatar-item').classList.add('purchased');
            } else {
                alert('Failed to update avatar. Please try again.');
            }
        } else {
            // Not enough PPP
            alert(`Insufficient PPP. You need ${requiredPPP} PPP to unlock this avatar.`);
        }
    }
    // Loop through all buy buttons and add event listeners
    buyButtons.forEach(button => {
        button.addEventListener('click', buy);
    });
    // You could add more functionality here like:
    // - Checking user's space credits
    // - Updating user's profile
    // - Making an API call to save the selection

}