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

  document.addEventListener('DOMContentLoaded', () => {
    const signupBtn = document.getElementById('signup-btn');
    const loginBtn = document.getElementById('login-btn');

    const signupModal = document.querySelector('[data-modal="signup"]');
    const signupForm = document.querySelector('[data-form="signup"]');
    const closeSign = document.querySelector('[data-close="signup"]');

    const otpModal = document.querySelector('[data-modal="otp"]');
    const otpForm = document.querySelector('[data-form="otp"]');
    const closeOtp = document.querySelector('[data-close="otp"]');


    const users = []; // Assuming you have a users array to store user data

    function displayModal(modal) {
        modal.style.display = 'flex';
        modal.style.flexDirection = 'column';
        modal.style.alignItems = 'center';
        modal.style.zIndex = '1';
    }

    function hideModal(modal) {
        modal.style.display = 'none';
    }

    // Event listener for closing the signup modal
    closeSign.addEventListener('click', () => {
        hideModal(signupModal);
        signupForm.reset();
    });

    // Event listener for closing the OTP modal
    closeOtp.addEventListener('click', () => {
        hideModal(otpModal);
        otpForm.reset();
    });

    // Event listener for opening the signup modal
    signupBtn.addEventListener('click', () => {
        displayModal(signupModal);
    });

    // Event listener for submitting the signup form
    signupForm.addEventListener('submit', (e) => {
        e.preventDefault(); // prevent the page from reloading after submitting

        const firstname = signupForm.querySelector('[name="fname"]').value;
        const lastname = signupForm.querySelector('[name="lname"]').value;
        const username = signupForm.querySelector('[name="uname"]').value;
        const email = signupForm.querySelector('[name="email"]').value;
        const passwd = signupForm.querySelector('[name="passwd"]').value;

        const newUser = new User(firstname, lastname, username, email, passwd);
        users.push(newUser);
        users.forEach(usr => {console.log(usr)})

        signupForm.reset();
        hideModal(signupModal);

        const otpMailText = otpModal.querySelector('#otp-mail-text')
        otpMailText.textContent = email;
        displayModal(otpModal);

        const firstOtpInput = otpForm.querySelector('[name="num-1"]')
        firstOtpInput.focus();
    });

    // Event listener for submitting the OTP form
    otpForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const otpCode = [];
        for (let i = 1; i <= 6; i++) {
            const num = otpForm.querySelector(`[name="num-${i}"]`).value;
            otpCode.push(num);
        }
        // otpCode.forEach(num => console.log(num));
        hideModal(otpModal);
        otpForm.reset();
    });

    // Close the signup modal when clicking outside of it
    window.addEventListener("click", (event) => {
        if (!signupModal.contains(event.target) && event.target !== signupBtn) {
            hideModal(signupModal);
            signupForm.reset();
        }
    });
    
    // Close the OTP modal when clicking outside of it
    window.addEventListener("click", (event) => {
        if (!otpModal.contains(event.target) && event.target !== signupForm.querySelector('[class="form-submit"]')) {
            hideModal(otpModal);
            otpForm.reset();
        }
    });
});