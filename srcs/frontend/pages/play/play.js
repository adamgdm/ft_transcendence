export function flip() {
    document.querySelector('.play1v1-inner').addEventListener('click', function() {
        this.classList.toggle('is-flipped')
        setTimeout(() => {
            this.classList.remove('is-flipped')
        }, 5000)
    })

    document.querySelector('.play1vAI-inner').addEventListener('click', function() {
        this.classList.toggle('is-flipped')
        setTimeout(() => {
            this.classList.remove('is-flipped')
        }, 5000)
    })

    
    document.querySelector('.playTourn-inner').addEventListener('click', function() {
        this.classList.toggle('is-flipped')
        setTimeout(() => {
            this.classList.remove('is-flipped')
        }, 5000)
    })
}