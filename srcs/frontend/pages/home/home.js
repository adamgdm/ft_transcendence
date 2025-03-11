export function home() {

    console.log('haaa l home dakhlaat')

    const fullName = document.querySelector('[profileElement="fullName"]')
    const userName = document.querySelector('[profileElement="userName"]')


    fetch('https://localhost:8000/profile/',
    {
        method: "GET",
        credentials: "include",}
    )
    .then(response => {
        if (response.status != 200) {
        throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(userData => {
        // Process the retrieved user data
        console.log('User Data:', userData);
    })
    .catch(error => {
        console.error('Error:', error);
    });
}