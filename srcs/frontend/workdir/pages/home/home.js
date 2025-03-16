export function home() {
    const fullName = document.querySelector('[profileElement="fullName"]')
    const userName = document.querySelector('[profileElement="userName"]')

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
    })
    .catch(error => {
        console.error('Error:', error);
    });
    
    document.querySelector(".see-friends-btn").addEventListener("click", function() {
        document.getElementById("friends-modal").style.opacity = "1";
        document.getElementById("friends-modal").style.visibility = "visible";
    });
    document.querySelector(".close-btn").addEventListener("click", function() {
        document.getElementById("friends-modal").style.opacity = "0";
        document.getElementById("friends-modal").style.visibility = "hidden";
    });
}