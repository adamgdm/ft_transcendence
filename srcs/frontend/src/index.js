class User {
    constructor(fname, lname, uname, email, passwd) {
      this.fname = fname;
      this.lname = lname;
      this.uname = uname;
      this.email = email;
      this.passwd = passwd;
    }
    printInfo() {
        console.log(`User informations: ${this.fname} ${this.lname} ${this.uname} ${this.email} ${this.passwd}`)
    }
  }

const users = []

const signupBtn = document.getElementById('signup-btn')
const loginBtn = document.getElementById('login-btn')

const signupModal = document.getElementById('signup-modal')
const otpModal = document.getElementById('otp-modal')
const closeSign = document.getElementsByClassName('sign-close-btn')

const signupForm = document.getElementById('signup-form')
const otpForm = document.getElementById('otp-form')
const closeOtp = document.getElementById('otp-close-btn')


// DISPLAY MODAL
function displayModal(modal)    {
    modal.style.display = 'flex'
    modal.style.flexDirection = 'column'
    modal.style.alignItems = 'center'
    modal.style.zIndex = '1'
}

// HIDE MODAL
function hideModal(modal)   {
    modal.style.display = 'none'
}


// The SIGN UP BUTTON
signupBtn.addEventListener('click', () => {
    displayModal(signupModal)

    window.addEventListener("click", (event) => {
        if (!signupModal.contains(event.target) && event.target !== signupBtn) {
            hideModal(signupModal);
            signupForm.reset();
        }
    });
    
    window.addEventListener("click", (event) => {
        if (!otpModal.contains(event.target) && event.target !== otpForm) {
            hideModal(otpModal);
            otpForm.reset();
        }
    });
})

// Array.from(closeModal).forEach(close => close.addEventListener('click', () => {
//     hideModal(signupModal);
//     hideModal(otpModal);
//     signupForm.reset();
//     otpForm.reset();
// }));


closeOtp.addEventListener('click', () => {
    hideModal(otpModal)
    otpForm.reset()
})

// The SIGN UP FORM
signupForm.addEventListener('submit', (e) => {
    e.preventDefault()

    const firstname = document.getElementById('Fname').value
    const lastname = document.getElementById('Lname').value
    const username = document.getElementById('Uname').value
    const email = document.getElementById('Email').value
    const passwd = document.getElementById('Passwd').value
    
    const newUser = new User(firstname, lastname, username, email, passwd)
    users.push(newUser)
    console.log(users.length)
    users.forEach(usr => usr.printInfo())
    
    signupForm.reset()
    hideModal(signupModal)
    displayModal(otpModal)
    

    document.getElementById('num-1').focus()
    document.getElementById('otp-mail-text').textContent = newUser.email
})


// The OTP FORM
otpForm.addEventListener('submit', (e) => {
    e.preventDefault()
    
    const otpCode = []

    for (let i = 1; i <= 6; i++)   {
        const num = document.getElementById(`num-${i}`)
        otpCode.push(num.value)
    }
    otpForm.reset()
    hideModal(otpModal)

    // otpCode.forEach(num => console.log(num))    
    console.log('\n\n')        
})
