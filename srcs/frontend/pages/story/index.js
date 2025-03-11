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

    const signupBtn = document.getElementById('signup-btn')
    const loginBtn = document.getElementById('login-btn')

    const close = document.querySelectorAll('[data-close]')

    const signupModal = document.querySelector('[data-modal="signup"]')
    const signupForm = document.querySelector('[data-form="signup"]')

    const vefiricationModal = document.querySelector('[data-modal="email-verification"]')
    const vefiricationForm = document.querySelector('[data-form="email-verification"]')

    const loginModal = document.querySelector('[data-modal="login"]')
    const loginForm = document.querySelector('[data-form="login"]')
    const loginForBtn = document.getElementsByClassName('login-forpass-btn')[0]

    const forgotPassModal = document.querySelector('[data-modal="forgot-password"]')
    const forgotPassForm = document.querySelector('[data-form="forgot-password"]')


    const users = []; // Assuming you have a users array to store user data

    function displayModal(modal) {
        modal.classList.add("active")
        document.body.classList.add("open-modal")
    }

    function hideModal(modal) {
        modal.classList.remove("active")
        document.body.classList.remove("open-modal")
    }

    // Event listener for closing the SIGNUP modal
    close.forEach(item => {item.addEventListener('click', () => {
        const parent = item.parentElement
        console.log(item.parentElement.getAttribute('data-modal'))
        hideModal(parent)
    })})

    // Event listener for opening the SIGNUP modal
    signupBtn.addEventListener('click', () => {
        displayModal(signupModal);
    });

    // Event listener for opening the LOGIN modal
    loginBtn.addEventListener('click', () => {
        displayModal(loginModal)
    })

    let emmail

    // Event listener for submitting the signup form
    signupForm.addEventListener('submit', (e) => {
        e.preventDefault(); // prevent the page from reloading after submitting

        const firstname = signupForm.querySelector('[name="fname"]').value;
        const lastname = signupForm.querySelector('[name="lname"]').value;
        const username = signupForm.querySelector('[name="uname"]').value;
        const email = signupForm.querySelector('[name="email"]').value;
        emmail = email
        const passwd = signupForm.querySelector('[name="passwd"]').value;

        const newUser = new User(firstname, lastname, username, email, passwd);
        users.push(newUser);
        users.forEach(usr => {usr.printInfo()})

        const userData = {
            first_name: firstname,
            last_name: lastname,
            user_name: username,
            email: email,
            password: passwd,
        };
        
        fetch('https://localhost:8000/register/', {  // Use HTTP for localhost unless SSL is configured
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',  // Corrected "application/JSON" to "application/json"
            },
            body: JSON.stringify(userData),
        })
        .then(response => response.json())  // Convert response to JSON
        .then(data => console.log('Success:', data))  // Handle success
        .catch(error => console.error('Error:', error));  // Handle errors

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

        const verfiInfos = {
            email: emmail,
            code: verifCode.join(''),
        }

        console.log(verfiInfos.code)
        console.log(verifCode)

        fetch('https://localhost:8000/verify_email/', {  // Use HTTP for localhost unless SSL is configured
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',  // Corrected "application/JSON" to "application/json"
            },
            body: JSON.stringify(verfiInfos),
        })
        .then(response => response.json())  // Convert response to JSON
        .then(data => console.log('Success:', data))  // Handle success
        .catch(error => console.error('Error:', error));  // Handle errors
        // verifCode.forEach(num => console.log(num));
        vefiricationForm.reset();
        hideModal(vefiricationModal);

        const firstVerifInput = vefiricationForm.querySelector('[name="num-1"]')
        firstVerifInput.focus();
    });

    // Event listener for submitting the LOGIN form
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const email = loginForm.querySelector('#login-email').value;
        const pass = loginForm.querySelector('#login-passwd').value;

        ////////////////////////////////////
        // send data to adaam to verify it
        ///////////////////////////////////
        const logiina = {
            login: email,
            password: pass,
        };

        fetch('https://localhost:8000/login/', {  // Use HTTP for localhost unless SSL is configured
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',  // Corrected "application/JSON" to "application/json"
            },
            body: JSON.stringify(logiina),
            credentials: 'include',  // ✅ Add this line to include cookies in the request
        })
        .then(response => {
            if (response.status != 200) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            console.log('Login successful:', data);

            // Store authentication state in localStorage
            localStorage.setItem('isAuthenticated', 'true');

            // Redirect user to home page
            window.location.hash = 'home';
        })
        .catch(error => console.error('Error:', error));  // Handle errors

        console.log("Login informations:  " + email + "  " + pass);

        loginForm.reset();
        hideModal(loginModal);
    });


    // Event listener for the FORGOT PASSWORD button in login modal
    loginForBtn.addEventListener('click', () => {
        hideModal(loginModal)
        displayModal(forgotPassModal)
        forgotPassForm.reset()
        
        const steps = document.querySelectorAll("[for-step]");
        let currentStep = 1;
        showStep(currentStep);

        function showStep(stepNumber) {
            steps.forEach(step => {
                step.classList.add("hidden");
                if (step.getAttribute('for-step') == stepNumber) {
                    step.classList.remove("hidden");
                }
            });
        }

        document.getElementById("sendCode").addEventListener("click", () => {
            // Simulate sending code and move to step 2
            currentStep = 2;
            showStep(currentStep);
        });

        document.getElementById("verifyCode").addEventListener("click", () => {
            // Simulate verifying code and move to step 3
            currentStep = 3;
            showStep(currentStep);
        });

        document.getElementById("resetPassword").addEventListener("click", () => {
            currentStep = 1
            hideModal(forgotPassModal)
        });
    })

}