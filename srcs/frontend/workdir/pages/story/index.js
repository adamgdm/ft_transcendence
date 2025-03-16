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


    const users = [];

    let emmail; // Store the email for verification
    let isVerificationSuccessful = false; // Flag to track verification success

    function displayModal(modal) {
        modal.classList.add("active");
        document.body.classList.add("open-modal");
    
        if (modal === vefiricationModal) {
            console.log('hello');
            setTimeout(() => {
                const firstVerifInput = vefiricationForm.querySelector('[name="num-1"]');
                firstVerifInput.focus();
            }, 50);
        }
    }

    function hideModal(modal) {
        modal.classList.remove("active");
        document.body.classList.remove("open-modal");

        if (modal === vefiricationModal && !isVerificationSuccessful) {
            fetch('/api/delete_account/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email: emmail }),
            })
            .then(response => response.json())
            .then(data => console.log('Email deleted:', data))
            .catch(error => console.error('Error:', error));
        }

        isVerificationSuccessful = false;
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

    // Event listener for submitting the signup form
    signupForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const firstname = signupForm.querySelector('[name="fname"]').value;
        const lastname = signupForm.querySelector('[name="lname"]').value;
        const username = signupForm.querySelector('[name="uname"]').value;
        const email = signupForm.querySelector('[name="email"]').value;
        emmail = email;
        const passwd = signupForm.querySelector('[name="passwd"]').value;

        const newUser = new User(firstname, lastname, username, email, passwd);
        users.push(newUser);
        users.forEach(usr => usr.printInfo());

        const userData = {
            first_name: firstname,
            last_name: lastname,
            user_name: username,
            email: email,
            password: passwd,
        };

        fetch('/api/register/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(userData),
        })
        .then(response => response.json())
        .then(data => console.log('Success:', data))
        .catch(error => console.error('Error:', error));

        signupForm.reset();
        hideModal(signupModal);

        const verificationMailText = vefiricationModal.querySelector('.verification-mail-text');
        verificationMailText.textContent = email;
        displayModal(vefiricationModal);
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
        };

        console.log(verfiInfos.code);
        console.log(verifCode);

        fetch('/api/verify_email/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(verfiInfos),
        })
        .then(response => response.json())
        .then(data => {
            console.log('Success:', data);
            isVerificationSuccessful = true;
            hideModal(vefiricationModal);
        })
        .catch(error => console.error('Error:', error));

        vefiricationForm.reset();
    });

    // Auto-focus functionality for verification inputs
    const verificationInputs = vefiricationForm.querySelectorAll('.form-input');

    verificationInputs.forEach((input, index) => {
        input.addEventListener('input', function (event) {
            // If the input has a value, move focus to the next input
            if (event.target.value.length === 1) {
                if (index < verificationInputs.length - 1) {
                    verificationInputs[index + 1].focus();
                }
            }
        });

        input.addEventListener('keydown', function (event) {
            // Handle backspace to move focus to the previous input
            if (event.key === 'Backspace' && event.target.value.length === 0) {
                if (index > 0) {
                    verificationInputs[index - 1].focus();
                }
            }
        });
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

        fetch('/api/login/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(logiina),
            credentials: 'include',
        })
        .then(response => {
            console.log('Response status:', response.status);
            if (response.status !== 200) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            console.log('Login successful:', data);
        
            localStorage.setItem('isAuthenticated', 'true');
            window.isAuthenticated = true;

            window.location.hash = 'home';
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Login failed: ' + error.message);
        });

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