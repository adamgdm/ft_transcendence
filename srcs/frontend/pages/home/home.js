export function home() {
    console.log('haaa l home dakhlaat')

    const fullName = document.querySelector('[profileElement="fullName"]')
    const userName = document.querySelector('[profileElement="userName"]')

    fetch('https://localhost:8000/profile/', {
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
        // Process the retrieved user data
        console.log('User Data:', userData);

        // Update the DOM elements with user data
        if (fullName) {
            fullName.textContent = `${userData.first_name} ${userData.last_name}`; // Combine first_name and last_name for full name
        }
        if (userName) {
            userName.textContent = userData.user_name; // Set the username
        }
    })
    .catch(error => {
        console.error('Error:', error);
    });
}