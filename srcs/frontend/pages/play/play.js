function create_game(opponent_username) {
    let body;
    if (opponent_username === '') {
        body = ``;
    } else if (game_opponent === '') {
        body = `player=${encodeURIComponent(opponent_username)}`;
    }

    return fetch('https://localhost:8000/create_game/', {
        method: 'POST',
        credentials: "include",
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body
    });
}

export function flip() {
    document.querySelector('.play1v1-inner').addEventListener('click', function () {

        this.classList.toggle('is-flipped')

        document.querySelector('.create-tourn').addEventListener('click', function () {

        })
    })

    document.querySelector('.playLocally-inner').addEventListener('click', function () {
        this.classList.toggle('is-flipped')

    })


    const tournCard = document.querySelector('.playTourn-inner').addEventListener('click', function () {
        this.classList.toggle('is-flipped')
    })

    document.querySelector('.create-tourn').addEventListener('click', function (e) {
        e.stopPropagation()
        document.querySelector('.buttons').style.display = 'none'
        document.querySelector('.tourn-created').style.display = 'flex'
        document.querySelector('.tourn-created').style.flexDirection = 'column'
        document.querySelector('.tourn-created').style.alignItems = 'center'
        document.querySelector('.tourn-created').style.justifyContent = 'center'
    })

    document.querySelector('.join-tourn').addEventListener('click', function (e) {
        e.stopPropagation();
        document.querySelector('.buttons').style.display = 'none'
        document.querySelector('.tourn-joined').style.display = 'flex'
        document.querySelector('.tourn-joined').style.flexDirection = 'column'
        document.querySelector('.tourn-joined').style.alignItems = 'center'
        document.querySelector('.tourn-joined').style.justifyContent = 'center'
    })

    document.querySelectorAll('.cancel-btn').forEach(btn => btn.addEventListener('click', function (e) {
        e.stopPropagation()
        btn.parentElement.style.display = 'none'
        document.querySelector('.buttons').style.display = 'flex'
        document.querySelector('.buttons').style.flexDirection = 'column'
        document.querySelector('.buttons').style.justifyContent = 'space-between'
    }))

    document.querySelector('.tourn-code').addEventListener('click', function (e) {
        e.stopPropagation()
    })


    document.querySelector('.copy-btn').addEventListener('click', function (e) {
        e.stopPropagation()

        const codeElement = this.previousElementSibling; // Get the h4 before the button
        const codeText = codeElement.textContent.trim();
        navigator.clipboard.writeText(codeText)
    })

    document.querySelector('.playLocally-button').addEventListener('click', function (e) {
        create_game('')
            .then(response => {
                console.log("Response received:", response);
                return response.json().then(data => {
                    console.log("Parsed JSON:", data);
                    return { ok: response.ok, data };
                });
            })
            .then(({ ok, data }) => {
                if (ok && data.game_id) {
                    console.log("Game ID:", data.game_id);
                    history.pushState({ game_id: data.game_id, user: data.user }, "", "#game");
                    window.routeToPage('game')
                } else {
                    console.error("Game creation failed:", data);
                }
            })
            .catch(error => console.error("Error:", error));
    });
    
}