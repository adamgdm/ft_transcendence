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
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Login failed: ' + error.message);
        });
    })

    // Event listener for submitting the signup form
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
    
        const firstname = signupForm.querySelector('[name="fname"]').value;
        const lastname = signupForm.querySelector('[name="lname"]').value;
        const username = signupForm.querySelector('[name="uname"]').value;
        const email = signupForm.querySelector('[name="email"]').value;
        const passwd = signupForm.querySelector('[name="passwd"]').value;
        emmail = email
        
    
        const userData = {
            first_name: firstname,
            last_name: lastname,
            user_name: username,
            email: email,
            password: passwd,
        };

        showError(signupModal, 'Processing your registration...', true);
        const submitButton = signupForm.querySelector('input[type="submit"]');
        submitButton.disabled = true;
        try {
            const response = await fetch('/api/register/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(userData),
            });
    
            const data = await response.json();
    
            if (!response.ok) {
                const errorMessage = data.error || 'An unexpected error occurred';
                showError(signupModal, errorMessage, false);
                submitButton.disabled = false;
                return; 
            }
    
            showError(signupModal, 'Registration successful! Redirecting to verification...', true);
    
            setTimeout(() => {
                const newUser = new User(firstname, lastname, username, email, passwd);
                users.push(newUser);
                users.forEach(usr => usr.printInfo());
    
                signupForm.reset();
                
                const verificationMailText = vefiricationModal.querySelector('.verification-mail-text');
                hideModal(signupModal);
                verificationMailText.textContent = email;
                displayModal(vefiricationModal);
                submitButton.disabled = false;
            }, 1500);
    
        } catch (error) {
            showError(signupModal, 'Network error. Please check your connection and try again.', false);
            submitButton.disabled = false;
        }
    });

    // Event listener for submitting the VERIFICATION form
    vefiricationForm.addEventListener('submit', async (e) => {
        e.preventDefault();
    
        const verifCode = [];
        for (let i = 1; i <= 6; i++) {
            const num = vefiricationForm.querySelector(`[name="num-${i}"]`).value;
            verifCode.push(num);
        }
    
        const verifInfos = {
            email: emmail,
            code: verifCode.join(''),
        };
        console.log(verifInfos)
    
        showError(vefiricationModal, 'Verifying your code...', true);
        const submitButton = vefiricationForm.querySelector('input[type="submit"]');
        submitButton.disabled = true;
    
        try {
            const response = await fetch('/api/verify_email/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(verifInfos),
            });
    
            const data = await response.json();
    
            if (!response.ok) {
                const errorMessage = data.error || 'Verification failed. Please try again.';
                showError(vefiricationModal, errorMessage, false);
                submitButton.disabled = false;
                return;
            }
    
            showError(vefiricationModal, 'Email verified successfully! Closing...', true);
    
            setTimeout(() => {
                isVerificationSuccessful = true;
                vefiricationForm.reset();
                hideModal(vefiricationModal);
                submitButton.disabled = false;
            }, 1500);
    
        } catch (error) {
            showError(vefiricationModal, 'Network error. Please check your connection and try again.', false);
            submitButton.disabled = false;
        }
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logiina),
        credentials: 'include',
    })
    .then(response => {
        if (response.status === 205) {
            hideModal(loginModal);
            displayModal(otpVerificationModal);
            loginForm.reset();
            return null;
        } else if (response.status !== 200) {
            throw new Error('Invalid informations');
        }
        return response.json();
    })
    .then(data => {
        if (data == null) return;

        console.log('Login successful:', data);
        showError(loginModal, 'Login successful:', true)
        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('username', data.user_name || email);
        window.isAuthenticated = true;
        loginForm.reset();

        initializeWebSocket().then(() => {
            if (isConnected()) {
                hideModal(loginModal); // Move this here to ensure modal closes before routing
                // Wait for DOM to be ready
                if (document.readyState === 'complete') {
                    window.location.hash = 'home';
                    window.routeToPage('home');
                } else {
                    window.addEventListener('DOMContentLoaded', () => {
                        window.location.hash = 'home';
                        window.routeToPage('home');
                    }, { once: true });
                }
            } else {
                console.error('WebSocket not initialized, navigation aborted');
                showError(loginModal, 'Failed to initialize connection, please try again', false)
                localStorage.setItem('isAuthenticated', 'false');
                window.isAuthenticated = false;
            }
        }).catch(err => {
            console.error('WebSocket initialization failed:', err);
            showError(loginModal, 'Failed to initialize connection: ' + err.message, false);
            localStorage.setItem('isAuthenticated', 'false');
            window.isAuthenticated = false;
        });
    })
    .catch(error => {
        console.error('Error:', error);
        showError(loginModal,'Login failed: ' + error.message, false);
    });
});

// Event listener for submitting the OTP VERIFICATION form
otpVerificationForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const verifCode = [];
    for (let i = 1; i <= 6; i++) {
        const num = otpVerificationForm.querySelector(`[name="num-${i}"]`).value;
        verifCode.push(num);
    }

    const otpInfos = {
        login: emmail, // Assuming 'emmail' is a global variable from login
        otp: verifCode.join(''),
    };

    // Show loading message immediately
    showError(otpVerificationModal, 'Verifying OTP...', true);
    const submitButton = otpVerificationForm.querySelector('input[type="submit"]') || 
                       otpVerificationForm.querySelector('button[type="submit"]'); // Flexible selector
    submitButton.disabled = true; // Disable button to prevent multiple submissions

    try {
        const response = await fetch('/api/login_otp/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(otpInfos),
            credentials: 'include',
        });

        const data = await response.json();

        if (!response.ok) {
            // Show specific backend error
            const errorMessage = data.error || 'OTP verification failed. Please try again.';
            showError(otpVerificationModal, errorMessage, false);
            submitButton.disabled = false;
            return;
        }

        // Success case
        if (data.message === 'Login successful') {
            showError(otpVerificationModal, 'OTP verified successfully! Logging in...', true);
            localStorage.setItem('isAuthenticated', 'true');
            localStorage.setItem('username', emmail);
            window.isAuthenticated = true;

            try {
                await initializeWebSocket();
                setTimeout(() => {
                    if (isConnected()) {
                        otpVerificationForm.reset();
                        hideModal(otpVerificationModal);
                        if (document.readyState === 'complete') {
                            window.location.hash = 'home';
                            window.routeToPage('home');
                        } else {
                            window.addEventListener('DOMContentLoaded', () => {
                                window.location.hash = 'home';
                                window.routeToPage('home');
                            }, { once: true });
                        }
                    } else {
                        showError(otpVerificationModal, 'Failed to initialize connection, please try again', false);
                        localStorage.setItem('isAuthenticated', 'false');
                        window.isAuthenticated = false;
                        submitButton.disabled = false;
                    }
                }, 1500); // 1.5-second delay for success message visibility (matches email verification)
            } catch (err) {
                showError(otpVerificationModal, 'Failed to initialize connection: ' + err.message, false);
                localStorage.setItem('isAuthenticated', 'false');
                window.isAuthenticated = false;
                submitButton.disabled = false;
            }
        }

    } catch (error) {
        // Handle network errors
        showError(otpVerificationModal, 'Network error. Please check your connection and try again.', false);
        submitButton.disabled = false;
        console.error('Fetch error:', error);
    }
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