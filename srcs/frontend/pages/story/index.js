export function storyActions() {

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
    const loginBtn = document.getElementById('login-btn');

    const signupModal = document.querySelector('[data-modal="signup"]');
    const signupForm = document.querySelector('[data-form="signup"]');
    const close = document.querySelectorAll('[data-close]');

    const vefiricationModal = document.querySelector('[data-modal="email-verification"]');
    const vefiricationForm = document.querySelector('[data-form="email-verification"]');


    const users = []; // Assuming you have a users array to store user data

    function displayModal(modal) {
        modal.classList.add("active")
        document.body.classList.add("open-modal")
    }

    function hideModal(modal) {
        modal.classList.remove("active")
        document.body.classList.remove("open-modal")
    }

    // Event listener for closing the signup modal
    close.forEach(item => {item.addEventListener('click', () => {
        const parent = item.parentElement
        console.log(item.parentElement.getAttribute('data-modal'))
        hideModal(parent)
    })})

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
        vefiricationForm.reset();
        hideModal(vefiricationModal);

        const firstVerifInput = vefiricationForm.querySelector('[name="num-1"]')
        firstVerifInput.focus();
    });
}