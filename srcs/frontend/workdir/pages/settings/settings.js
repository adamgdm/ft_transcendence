export function settings() {

    
    fetch('/api/profile/', {
        method: "GET",
        credentials: "include"
    })
    .then(response => {
        if (response.status != 200) {
            throw new Error('Network response was not ok: ' + response.status);
        }
        return response.json(); 
    })
    .then(userData => {
        console.log('User Data:', userData);

        console.log(userData)
        // Populate personal information
        document.getElementById('change-lastName').placeholder = userData.last_name || '';
        document.getElementById('change-firstName').placeholder = userData.first_name || '';
        document.getElementById('change-userName').placeholder = userData.user_name || '';
        document.getElementById('change-email').placeholder = userData.email || '';

        // Set the OTP checkbox state
        const otpCheckbox = document.getElementById('change-otpLogin');
        if (userData.two_factor_enabled) {
            otpCheckbox.checked = true;
        } else {
            otpCheckbox.checked = false;
        }

    })
    .catch(error => {
        console.error('Error:', error);
    });

    /*************************
    * Profile Picture change *
    *************************/
    const fileInput = document.getElementById('change-avatar-1');
    const deleteButton = document.getElementById('change-avatar-2');
    const profileImage = document.querySelector('[profileElement="pic"] img');
    const defaultImage = "https://articles-images.sftcdn.net/wp-content/uploads/sites/3/2016/01/wallpaper-for-facebook-profile-photo.jpg";

    // Handle profile picture upload and preview
    function handleProfilePictureUpload(event) {
        const file = event.target.files[0]; // Get the selected file
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                profileImage.src = e.target.result; // Set the preview image
            };
            reader.readAsDataURL(file); // Read the file as a data URL
        }
    }

    // Handle profile picture deletion
    function handleProfilePictureDelete() {
        profileImage.src = defaultImage; // Reset to default image
        fileInput.value = ""; // Clear file input
    }

    // Attach event listeners
    fileInput.addEventListener('change', handleProfilePictureUpload);
    deleteButton.addEventListener('click', handleProfilePictureDelete);
    
    /**********************
     * Email Verification *
     **********************/
    const verifyEmailBtn = document.getElementById('verify-email-btn');
    const verificationBox = document.getElementById('verification-box');
    const submitCodeBtn = document.getElementById('submit-code-btn');
    const emailInput = document.getElementById('change-email');
    const codeInput = document.getElementById('verification-code');
    const verificationMessage = document.getElementById('verification-message');
    
    let emailVerified = false; // Track email verification status
    
    // Initialize the original email attribute
    emailInput.setAttribute('data-original-email', '');
    
// When verify button is clicked
verifyEmailBtn.addEventListener('click', function(event) {
    // Prevent any form submission that might be triggered
    event.preventDefault();
    event.stopPropagation();
    
    const email = emailInput.value.trim();
    if (!email || !isValidEmail(email)) {
        alert('Please enter a valid email address');
        return;
    }
    
    if (verificationBox.style.display === 'block') {
        sendVerificationCode(email);
        verificationMessage.textContent = 'Verification code resent';
        verificationMessage.className = 'success-message';
    } else {
        verificationBox.style.display = 'block';
        sendVerificationCode(email);
    }
    
    verifyEmailBtn.textContent = 'Resend';
});

// When submit code button is clicked
submitCodeBtn.addEventListener('click', function(event) {
    // Prevent any form submission that might be triggered
    event.preventDefault();
    event.stopPropagation();
    
    const code = codeInput.value.trim();
    if (!code) {
        verificationMessage.textContent = 'Please enter the verification code';
        verificationMessage.className = 'error-message';
        return;
    }
    verifyCode(code);
});
    
    // Hide verification box when clicking outside
    document.addEventListener('click', function(event) {
        const isClickInside = verificationBox.contains(event.target) || verifyEmailBtn.contains(event.target);
        if (!isClickInside && verificationBox.style.display === 'block' && !emailInput.classList.contains('verified-email')) {
            verificationBox.style.display = 'none';
            verifyEmailBtn.textContent = 'Verify';
        }
    });
    
    function isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
    
    function sendVerificationCode(email) {
        console.log('Sending verification code to: ' + email);
        verificationMessage.textContent = 'Verification code sent to your email';
        verificationMessage.className = 'success-message';
    }
    
    function verifyCode(code) {
        if (code === '123456') {
            verificationMessage.textContent = 'Email verified successfully!';
            verificationMessage.className = 'success-message';
            emailInput.setAttribute('readonly', true);
            emailInput.classList.add('verified-email');
            verifyEmailBtn.textContent = 'Verified';
            verifyEmailBtn.style.backgroundColor = '#4CAF50';
            verifyEmailBtn.disabled = true;
            emailVerified = true; // Set emailVerified to true
            setTimeout(() => verificationBox.style.display = 'none', 2000);
            console.log('Email verification successful - update backend');
        } else {
            verificationMessage.textContent = 'Invalid code. Please try again.';
            verificationMessage.className = 'error-message';
        }
    }
    
    /**********************
     * Form Submission *
     **********************/
    const form = document.getElementById('myForm');
    let isSubmitting = false;
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (isSubmitting || !validateForm()) return;
        isSubmitting = true;
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
        const promises = [];
        
        const emailInput = document.getElementById('change-email');
        const isEmailChanged = emailInput.value !== emailInput.getAttribute('data-original-email');
        
        // Check if email is verified if it was changed
        if (isEmailChanged && !emailVerified) { // Only check verification at form submission
            alert('Please verify your email before submitting');
            isSubmitting = false;
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
            return; // Stop form submission entirely if email is not verified
        }
        
        // If we get here, the email is either unchanged or verified
        const personalInfoPromise = updatePersonalInfo();
        if (personalInfoPromise) promises.push(personalInfoPromise);
        
        // If password was entered, update password
        if (document.getElementById('currentPassword').value) {
            const passwordPromise = updatePassword();
            if (passwordPromise) promises.push(passwordPromise);
        }
        
        const otpPromise = updateOTPSetting();
        if (otpPromise) promises.push(otpPromise);
        
        Promise.all(promises)
            .then(() => {
                // Only reset the form if all promises resolve successfully
                // form.reset();
                showNotification('Settings updated successfully', 'success');
                
                // Reset email verification state after successful submission
                emailInput.setAttribute('data-original-email', emailInput.value);
                emailInput.classList.remove('verified-email');
                emailInput.removeAttribute('readonly');
                verifyEmailBtn.textContent = 'Verify';
                verifyEmailBtn.style.backgroundColor = '';
                verifyEmailBtn.disabled = false;
            })
            .catch(error => {
                showNotification('An error occurred', 'error');
            })
            .finally(() => {
                isSubmitting = false;
                submitBtn.disabled = false;
                submitBtn.textContent = originalBtnText;
            });
    });
    
    /**********************
     * Profile Updates *
     **********************/
    function updatePersonalInfo() {
        const formData = {
            lastName: document.getElementById('change-lastName').value,
            firstName: document.getElementById('change-firstName').value,
            userName: document.getElementById('change-userName').value,
            email: document.getElementById('change-email').value
        };
        
        // Remove empty fields
        Object.keys(formData).forEach(key => { if (!formData[key]) delete formData[key]; });
        
        // If no form data, return without doing anything
        if (Object.keys(formData).length === 0) return;
        
        console.log("Form data being sent to backend:", JSON.stringify(formData, null, 2));


        // Send form data to backend
        return fetch('/api/update_profile/', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        })
            .then(response => {
                if (!response.ok) {
                    // Check if the response is not OK (status code other than 2xx)
                    console.log('request faileed')
                    return response.json().then(errorData => {
                        // Handle the error based on the response status and message
                        if (response.status === 400 && errorData.error) {
                            alert(errorData.error); // Show error alert
                        }
                        throw new Error(errorData.error || 'Something went wrong');
                    });
                }
                console.log('request successed')
                return response.json(); // Return the response data if no error
            })
            .then(data => {
                // Handle success response
                showNotification('Settings updated successfully', 'success');
            })
            .catch(error => {
                // Handle any other errors (including the ones thrown above)
                showNotification(error.message, 'error');
            });

    }
    
    /**********************
     * Form Validation *
     **********************/
    function validateForm() {
        return true; // Add actual validation logic here
    }
    
    function updatePassword() {
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('change-newPassword').value;
        const confirmPassword = document.getElementById('change-confirmPassword').value;
        
        if (!currentPassword || !newPassword || newPassword !== confirmPassword) {
            alert('Check your password inputs');
            return;
        }
        
        return fetch('/api/modify_password/', {
            method: 'POST', 
            credentials: 'include', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, new_password: confirmPassword })
        })
        .then(response => response.json())
        .then(data => showNotification(data.success ? 'Password updated successfully' : 'Error: ' + data.error, data.success ? 'success' : 'error'))
        .catch(error => showNotification('An error occurred', 'error'));
    }
    
    function updateOTPSetting() {
        const enableOTP = document.getElementById('change-otpLogin').checked;
        return fetch('/api/profile/', { method: 'GET', credentials: 'include' })
        .then(response => response.json())
        .then(data => {
            if (data.two_factor_enabled !== enableOTP) {
                if (enableOTP) {
                    console.log('OTP enabled'); // Log when OTP is enabled
                } else {
                    console.log('OTP disabled'); // Log when OTP is disabled
                }
                return fetch(enableOTP ? '/api/enable_2fa/' : '/api/disable_2fa/', { 
                    method: 'POST', 
                    credentials: 'include'
                })
                .then(response => response.json())
                .then(data => showNotification(data.success ? '2FA settings updated' : 'Error: ' + data.error, data.success ? 'success' : 'error')); 
            }
            else {
                // Log the current state of OTP if no change is made
                if (enableOTP) {
                    console.log('OTP is already enabled');
                } else {
                    console.log('OTP is already disabled');
                }    
            }
        })
        .catch(error => console.error('Fetch error:', error.message));
    }
    
    function showNotification(message, type = 'success') {
        console.log(type + ': ' + message);
    }
}
