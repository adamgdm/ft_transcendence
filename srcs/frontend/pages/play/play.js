export function flip() {
    document.querySelector('.play1v1-inner').addEventListener('click', function() {
        
        this.classList.toggle('is-flipped')
        
        document.querySelector('.create-tourn').addEventListener('click', function() {
            
        })
    })

    document.querySelector('.play1vAI-inner').addEventListener('click', function() {
        this.classList.toggle('is-flipped')
        
    })
    
    
    const tournCard = document.querySelector('.playTourn-inner').addEventListener('click', function() {
        this.classList.toggle('is-flipped')
    })

    document.querySelector('.create-tourn').addEventListener('click', function(e) {
        e.stopPropagation()
        document.querySelector('.buttons').style.display = 'none'
        document.querySelector('.tourn-created').style.display = 'flex'
        document.querySelector('.tourn-created').style.flexDirection = 'column'
        document.querySelector('.tourn-created').style.alignItems = 'center'
        document.querySelector('.tourn-created').style.justifyContent = 'center'
    })

    document.querySelector('.join-tourn').addEventListener('click', function(e) {
        e.stopPropagation();
        document.querySelector('.buttons').style.display = 'none'
        document.querySelector('.tourn-joined').style.display = 'flex'
        document.querySelector('.tourn-joined').style.flexDirection = 'column'
        document.querySelector('.tourn-joined').style.alignItems = 'center'
        document.querySelector('.tourn-joined').style.justifyContent = 'center'
    })

    document.querySelectorAll('.cancel-btn').forEach(btn => btn.addEventListener('click', function(e) {
        e.stopPropagation()
        btn.parentElement.style.display = 'none'
        document.querySelector('.buttons').style.display = 'flex'
        document.querySelector('.buttons').style.flexDirection = 'column'
        document.querySelector('.buttons').style.justifyContent = 'space-between'
    }))

    document.querySelector('.tourn-code').addEventListener('click', function(e) {
        e.stopPropagation()
    })


    document.querySelector('.copy-btn').addEventListener('click', function(e) {
        e.stopPropagation()
        
        const codeElement = this.previousElementSibling; // Get the h4 before the button
        const codeText = codeElement.textContent.trim();
        navigator.clipboard.writeText(codeText)
    })
}