import { initializeWebSocket, isConnected } from '../../globalWebsocket.js';

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
            console.log(`User informations: ${this.fname} ${this.lname} ${this.uname} ${this.email} ${this.passwd}`);
        }
    }

    const signupBtn = document.getElementById('signup-btn');
    const loginBtn = document.getElementById('login-btn');
    const oauth2Btn = document.getElementById('login-42-btn');

    const close = document.querySelectorAll('[data-close]');

    const signupModal = document.querySelector('[data-modal="signup"]');
    const signupForm = document.querySelector('[data-form="signup"]');

    const vefiricationModal = document.querySelector('[data-modal="email-verification"]');
    const vefiricationForm = document.querySelector('[data-form="email-verification"]');

    const loginModal = document.querySelector('[data-modal="login"]');
    const loginForm = document.querySelector('[data-form="login"]');
    const loginForBtn = document.getElementsByClassName('login-forpass-btn')[0];

    const otpVerificationModal = document.querySelector('[data-modal="otp-verification"]');
    const otpVerificationForm = document.querySelector('[data-form="otp-verification"]');

    const forgotPassModal = document.querySelector('[data-modal="forgot-password"]');
    const forgotPassForm = document.querySelector('[data-form="forgot-password"]');

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
    close.forEach(item => {
        item.addEventListener('click', () => {
            const parent = item.parentElement;
            console.log(item.parentElement.getAttribute('data-modal'));
            hideModal(parent);
        });
    });

    // Event listener for opening the SIGNUP modal
    signupBtn.addEventListener('click', () => {
        displayModal(signupModal);
    });

    // Event listener for opening the LOGIN modal
    loginBtn.addEventListener('click', () => {
        displayModal(loginModal)
    })

    ////////////////////////////////////   ////////////////////////////////////   
    // this is ossama's part to be handled
    ////////////////////////////////////   ////////////////////////////////////   

    oauth2Btn.addEventListener('click', () => {
        fetch('/api/oauth2/login/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
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
            console.log('Received auth URL', data);
            if (data.auth_url){
                window.location.href = data.auth_url;
                console.log('holaaaa')
            } else {
                throw new Error('URL was not received')
            }
            // localStorage.setItem('isAuthenticated', 'true');
            // window.isAuthenticated = true;

            // window.location.hash = 'home';
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Login failed: ' + error.message);
        });
    })

    // Event listener for submitting the signup form
    signupForm.addEventListener('submit', (e) => {
        e.preventDefault();
    
        const firstname = signupForm.querySelector('[name="fname"]').value;
        const lastname = signupForm.querySelector('[name="lname"]').value;
        const username = signupForm.querySelector('[name="uname"]').value;
        const email = signupForm.querySelector('[name="email"]').value;
        const passwd = signupForm.querySelector('[name="passwd"]').value;
        emmail = email;
    
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
        .then(response => {
            if (!response.ok && response.status !== 467) {
                return response.json().then(err => { throw err; });
            }
            return response.json();
        })
        .then(data => {
            console.log('Success:', data);
            signupForm.reset();
            hideModal(signupModal);
    
            const verificationMailText = vefiricationModal.querySelector('.verification-mail-text');
            verificationMailText.textContent = email;
            displayModal(vefiricationModal);
        })
        .catch(error => {
            console.error('Error:', error);
            showError(signupModal, error.error || 'An unexpected error occurred');
        });
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

        fetch('/api/verify_email/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(verfiInfos),
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => { throw err; });
            }
            return response.json();
        })
        .then(data => {
            console.log('Success:', data);
            isVerificationSuccessful = true;
            hideModal(vefiricationModal);
            // showError(vefiricationModal, 'Email verified successfully!', true);
        })
        .catch(error => {
            console.error('Error:', error);
            showError(vefiricationModal, error.error || 'An unexpected error occurred');
        });

        vefiricationForm.reset(); // Reset the form
    });

    // Auto-focus functionality for verification inputs
    const verificationInputs = vefiricationForm.querySelectorAll('.form-input');

    verificationInputs.forEach((input, index) => {
        input.addEventListener('input', function (event) {
            if (event.target.value.length === 1) {
                if (index < verificationInputs.length - 1) {
                    verificationInputs[index + 1].focus();
                }
            }
        });

        input.addEventListener('keydown', function (event) {
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
        emmail = email;

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
            if (response.status === 205) {
                hideModal(loginModal);
                const otpverificationMailText = otpVerificationModal.querySelector('.otpverification-mail-text');
                otpverificationMailText.textContent = email;
                displayModal(otpVerificationModal);
                return null;
            } else if (!response.ok) {
                return response.json().then(errData => {
                    throw new Error(errData.error || 'Login failed');
                });
            }
            return response.json();
        })
        .then(data => {
            if (data == null) {
                return;
            }
            showError(loginModal, "Login successful", true)
            // console.log('Login successful:', data);
        
            localStorage.setItem('isAuthenticated', 'true');
            window.isAuthenticated = true;

            initializeWebSocket();
            setTimeout(() => {
                if (isConnected()) {
                    window.location.hash = 'home';
                } else {
                    showError(loginModal, 'Failed to initialize connection, please try again', false);
                }
            }, 1000);
        })
        .catch(error => {
            console.error('Error:', error);
            showError(loginModal, error.message, false);
        });

        console.log("Login informations:  " + email + "  " + pass);
    });

    // Event listener for submitting the OTP VERIFICATION form
    otpVerificationForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const verifCode = [];
        for (let i = 1; i <= 6; i++) {
            const num = otpVerificationForm.querySelector(`[name="num-${i}"]`).value;
            verifCode.push(num);
        }
        console.log(emmail)
        const otpInfos = {
            login: emmail,
            otp: verifCode.join(''),
        };

        console.log(otpInfos.otp);
        console.log(verifCode);

        fetch('/api/login_otp/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(otpInfos),
        })
        .then(response => {
            // Even if it's a 400, parse the response and handle it
            return response.json().catch(() => {
                // If JSON parsing fails, return a default error object
                return { error: 'Unable to process server response' };
            });
        })
        .then(data => {
            console.log("Login informations:  " + otpInfos.emmail + "  " + otpInfos.otp);
            console.log('Success:', data);
            if (data.message === 'Login successful') {
                isVerificationSuccessful = true;
                hideModal(otpVerificationModal);
                localStorage.setItem('isAuthenticated', 'true');
                window.isAuthenticated = true;

                // Initialize WebSocket and only navigate if connected
                initializeWebSocket();
                setTimeout(() => {
                    if (isConnected()) {
                        window.location.hash = 'home';
                    } else {
                        console.error('WebSocket not initialized, navigation aborted');
                        showError(otpVerificationModal, 'Failed to initialize connection, please try again', false);
                    }
                }, 1000); // Wait briefly to ensure WebSocket connects
            } else {
                console.error('Error:', data.error);
                showError(otpVerificationModal, data.error, false);
            }
        })
        .catch(error => {
            // Display the error in the UI instead of letting it hit the console unhandled
            showError(otpVerificationModal, error.message || 'An error occurred', false);
        });
        otpVerificationForm.reset();
    });

    // Auto-focus functionality for OTP verification inputs
    const otpInputs = otpVerificationForm.querySelectorAll('.form-input');

    otpInputs.forEach((input, index) => {
        input.addEventListener('input', function (event) {
            if (event.target.value.length === 1) {
                if (index < otpInputs.length - 1) {
                    otpInputs[index + 1].focus();
                }
            }
        });

        input.addEventListener('keydown', function (event) {
            if (event.key === 'Backspace' && event.target.value.length === 0) {
                if (index > 0) {
                    otpInputs[index - 1].focus();
                }
            }
        });
    });

    function isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    // Define variables to track if event listeners are already set up
    let forgotPasswordListenersInitialized = false;

    // Define these functions outside any event handler
    function showStep(stepNumber, steps) {
        steps.forEach(step => {
            step.classList.add("hidden");
            if (step.getAttribute('for-step') == stepNumber) {
                step.classList.remove("hidden");
            }
        });
    }

    // Event listener for the FORGOT PASSWORD button in login modal
    loginForBtn.addEventListener('click', () => {
        hideModal(loginModal);
        displayModal(forgotPassModal);
        forgotPassForm.reset();
        
        // Only set up the event listeners if they haven't been set up before
        if (!forgotPasswordListenersInitialized) {
            initializeForgotPasswordFlow();
            forgotPasswordListenersInitialized = true;
        }
        
        // Always reset to step 1 when opening the modal
        const steps = document.querySelectorAll("[for-step]");
        showStep(1, steps);
    });

    // Function to initialize all the forgot password step listeners
    function initializeForgotPasswordFlow() {
        // Get step elements
        const forgotPassModal = document.querySelector('[data-modal="forgot-password"]');
        const steps = document.querySelectorAll("[for-step]");
        let currentStep = 1;
        
        // Send verification code button
        document.getElementById("sendCode").addEventListener("click", async () => {
            const email = document.getElementById("forgot-mail").value;

            if (!email || !isValidEmail(email)) {
                console.log("Please enter a valid email address");
                showError(forgotPassModal, "Please enter a valid email address", false);
                return;
            }

            try {
                const response = await fetch('/api/send_otp_pass/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ 'email': email })
                });

                const data = await response.json();

                if (response.ok) {
                    showError(forgotPassModal, 'OTP sent successfully', true);
                    currentStep = 2;
                    showStep(currentStep, steps);
                } else {
                    showError(forgotPassModal, data.error || 'Failed to send OTP', false);
                }
            } catch (error) {
                console.error('Error:', error);
                showError(forgotPassModal, 'An error occurred while sending OTP', false);
            }
        });

        // Verify code button
        document.getElementById("verifyCode").addEventListener("click", async () => {
            const email = document.getElementById("forgot-mail").value;
            const otp = document.getElementById("reset-code").value;

            if (!email || !otp) {
                showError(forgotPassModal, "Please enter your email and OTP.", false);
                return;
            }

            try {
                const response = await fetch('/api/verify_email/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ 
                        email: email,
                        code: otp 
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    showError(forgotPassModal, 'OTP verified successfully', true);
                    currentStep = 3;
                    showStep(currentStep, steps);
                } else {
                    showError(forgotPassModal, data.error || 'Invalid OTP or email', false);
                }
            } catch (error) {
                console.error('Error:', error);
                showError(forgotPassModal, 'An error occurred while verifying OTP', false);
            }
        });

        // Reset password button
        document.getElementById("resetPassword").addEventListener("click", async () => {
            const email = document.getElementById("forgot-mail").value;
            const newPassword = document.getElementById("new-password").value;
            const confirmPassword = document.getElementById("confirm-password").value;
            

            if (newPassword !== confirmPassword) {
                showError(forgotPassModal, "Passwords do not match.", false);
                return;
            }

            try {
                const response = await fetch('/api/forgot_password/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ 
                        email: email,
                        new_password: newPassword 
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    showError(forgotPassModal, 'Password reset successfully', true);
                    setTimeout(() => {
                        currentStep = 1;
                        hideModal(forgotPassModal);
                    }, 500);
                } else {
                    showError(forgotPassModal, data.error || 'Failed to reset password', false);
                }
            } catch (error) {
                console.error('Error:', error);
                showError(forgotPassModal, 'An error occurred while resetting password', false);
            }
        });
    }

    function showError(modalSelector, message, isSuccess = false) {
        const errorModal = modalSelector.querySelector(".modal #errorModal");
        const errorMessage = modalSelector.querySelector(".modal #errorMessage");
    
        if (!errorModal || !errorMessage) {
            console.error("Error Modal or Message not found!");
            return;
        }
    
        errorMessage.textContent = message;
    
        errorModal.classList.remove("success", "failure");
    
        if (isSuccess) {
            errorModal.classList.add("success");
        } else {
            errorModal.classList.add("failure");
        }
    
        errorModal.style.opacity = "1";
        errorModal.style.visibility = 'visible'
    
        setTimeout(() => {
            errorModal.style.opacity = "0";
            errorModal.style.visibility = 'hidden'
            errorModal.style.transition = "opacity 0.3s ease-in-out, visibility 0.3s ease-in-out";
        }, 3000);
    }
    
    

}