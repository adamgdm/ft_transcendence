export function storyActions() {

    console.log('haliloywaaa')

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

    const signupBtn = document.getElementById('signup-btn');
    console.log("cc heramina" + signupBtn)
    const loginBtn = document.getElementById('login-btn');

    const signupModal = document.querySelector('[data-modal="signup"]');
    const signupForm = document.querySelector('[data-form="signup"]');
    const closeSign = document.querySelector('[data-close="signup"]');

    const vefiricationModal = document.querySelector('[data-modal="email-verification"]');
    const vefiricationForm = document.querySelector('[data-form="email-verification"]');
    const closeVerification = document.querySelector('[data-close="email-verification"]');


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

    // Event listener for closing the VERIFICATION modal
    closeVerification.addEventListener('click', () => {
        hideModal(vefiricationModal);
        vefiricationForm.reset();
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
        users.forEach(usr => {usr.printInfo()})

        signupForm.reset();
        hideModal(signupModal);

        const verificationMailText = vefiricationModal.querySelector('.verification-mail-text')
        verificationMailText.textContent = email;
        displayModal(vefiricationModal);

        const firstVerifInput = vefiricationForm.querySelector('[name="num-1"]')
        firstVerifInput.focus();
    });

    // Event listener for submitting the VERIFICATION form
    vefiricationForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const verifCode = [];
        for (let i = 1; i <= 6; i++) {
            const num = vefiricationForm.querySelector(`[name="num-${i}"]`).value;
            verifCode.push(num);
        }
        // verifCode.forEach(num => console.log(num));
        hideModal(vefiricationModal);
        vefiricationForm.reset();
    });

    // Close the signup modal when clicking outside of it
    window.addEventListener("click", (event) => {
        if (!signupModal.contains(event.target) && event.target !== signupBtn) {
            hideModal(signupModal);
            signupForm.reset();
        }
    });
    
    // Close the VERIFICATION modal when clicking outside of it
    window.addEventListener("click", (event) => {
        if (!vefiricationModal.contains(event.target) && event.target !== signupForm.querySelector('[class="form-submit"]')) {
            hideModal(vefiricationModal);
            vefiricationForm.reset();
        }
    });   
}