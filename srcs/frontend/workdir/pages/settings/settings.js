import { layoutShowError } from "../../routing.js";

export function settings() {

    let currentUserEmail = null

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
        /////////////////////////////////////////////////////
        if (userData.oauth2_authentified === true) {
            // Blur all input fields
            const inputs = [
                'change-userName',
                'change-email',
                'currentPassword',
                'change-newPassword',
                'change-confirmPassword',
                'change-otpLogin'
            ];
            
            inputs.forEach(inputId => {
                const element = document.getElementById(inputId);
                if (element) {
                    element.disabled = true;
                    // element.style.filter = 'blur(2px)';
                    element.style.pointerEvents = 'none';
                }
            });
    
            // Disable verify email button
            const verifyEmailBtn = document.getElementById('verify-email-btn');
            if (verifyEmailBtn) {
                verifyEmailBtn.disabled = true;
            }

            layoutShowError('Cannot modify info due to Intra authentication', false)
    
            // Populate fields but keep them blurred
            document.getElementById('change-lastName').placeholder = userData.last_name || '';
            document.getElementById('change-firstName').placeholder = userData.first_name || '';
            document.getElementById('change-userName').placeholder = userData.user_name || '';
            document.getElementById('change-email').placeholder = userData.email || '';
            currentUserEmail = userData.email;
    
            const otpCheckbox = document.getElementById('change-otpLogin');
            if (userData.two_factor_enabled) {
                otpCheckbox.checked = true;
            } else {
                otpCheckbox.checked = false;
            }
    
            return; // Exit early since no modifications are allowed
        }
        ///////////////////////////////////////////////
        // Populate personal information
        document.getElementById('change-lastName').placeholder = userData.last_name || '';
        document.getElementById('change-firstName').placeholder = userData.first_name || '';
        document.getElementById('change-userName').placeholder = userData.user_name || '';
        document.getElementById('change-email').placeholder = userData.email || '';
        currentUserEmail = userData.email

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
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            profileImage.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

// Handle profile picture deletion
function handleProfilePictureDelete() {
    profileImage.src = defaultImage;
    fileInput.value = "";
    deleteProfilePicture(); // Call the backend deletion function
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

// Initialize with current user email (you'll need to set this when page loads)
// For example: currentUserEmail = 'ddos@gmail.com';
emailInput.setAttribute('data-original-email', currentUserEmail);

// When verify button is clicked
verifyEmailBtn.addEventListener('click', function(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const email = emailInput.value.trim();
    if (!email || !isValidEmail(email)) {
        alert('Please enter a valid email address');
        return;
    }
    
    if (email === currentUserEmail) {
        alert('This email your Email and is already verified');
        return;
    }
    
    if (verificationBox.style.display === 'block') {
        sendVerificationCodeRequest(email);
        verificationMessage.textContent = 'Verification code resent';
        verificationMessage.className = 'success-message';
    } else {
        verificationBox.style.display = 'block';
        sendVerificationCodeRequest(email);
    }
    
    verifyEmailBtn.textContent = 'Resend';
});

// When submit code button is clicked
submitCodeBtn.addEventListener('click', function(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const code = codeInput.value.trim();
    const email = emailInput.value.trim();
    
    if (!code) {
        verificationMessage.textContent = 'Please enter the verification code';
        verificationMessage.className = 'error-message';
        return;
    }
    verifyCodeWithBackend(currentUserEmail, code);
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

// Request a verification code from the backend
function sendVerificationCodeRequest(email) {
    verificationMessage.textContent = 'Sending verification code...';
    verificationMessage.className = 'info-message';
    
    fetch('/api/send_otp_email_change/', {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 'email': email })
    })
    .then(response => {
        if (response.status != 200) {
            throw new Error('Network response was not ok: ' + response.error);
        }
        return response.json(); 
    })
    .then(data => {
        if (data.error) {
            verificationMessage.textContent = data.error;
            verificationMessage.className = 'error-message';
        } else {
            verificationMessage.textContent = 'Verification code sent to your email';
            verificationMessage.className = 'success-message';
        }
    })
    .catch(error => {
        console.error('Error:', error);
        verificationMessage.textContent = 'Failed to send verification code. Please try again.';
        verificationMessage.className = 'error-message';
    });
}

// Verify the code with the backend
function verifyCodeWithBackend(email, code) {
    verificationMessage.textContent = 'Verifying...';
    verificationMessage.className = 'info-message';
    
    fetch('/api/verify_email/', {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            email: email,
            code: code 
        })
    })
    .then(response => {
        if (response.status != 200) {
            throw new Error('Network response was not ok: ' + response.error);
        }
        return response.json(); 
    })
    .then(data => {
        if (data.error) {
            verificationMessage.textContent = data.error;
            verificationMessage.className = 'error-message';
        } else {
            verificationMessage.textContent = 'Email verified successfully!';
            verificationMessage.className = 'success-message';
            emailInput.setAttribute('readonly', true);
            emailInput.classList.add('verified-email');
            verifyEmailBtn.textContent = 'Verified';
            verifyEmailBtn.style.backgroundColor = '#4CAF50';
            verifyEmailBtn.disabled = true;
            emailVerified = true;
            
            currentUserEmail = email;
            emailInput.setAttribute('data-original-email', email);
            
            setTimeout(() => verificationBox.style.display = 'none', 2000);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        verificationMessage.textContent = 'Verification failed. Please try again.';
        verificationMessage.className = 'error-message';
    });
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
    const isEmailChanged = emailInput.value !== '' && emailInput.value !== emailInput.getAttribute('data-original-email');
    
    if (isEmailChanged && !emailVerified) {
        alert('Please verify your email before submitting');
        isSubmitting = false;
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
        return;
    }
    
    let personalResult, passwordResult, otpResult, profilePicResult, deletePicResult;

    updatePersonalInfo()
        .then(result => {
            personalResult = result;
            console.log('Personal info result:', personalResult);
            if (document.getElementById('currentPassword').value) {
                return updatePassword();
            }
            return Promise.resolve({ skipped: true });
        })
        .then(result => {
            passwordResult = result;
            console.log('Password result:', passwordResult);
            return updateOTPSetting();
        })
        .then(result => {
            otpResult = result;
            console.log('OTP result:', otpResult);
            return updateProfilePicture();
        })
        .then(result => {
            profilePicResult = result;
            console.log('Profile picture result:', profilePicResult);
            if (!fileInput.files[0] && profileImage.src === defaultImage) {
                return deleteProfilePicture();
            }
            return Promise.resolve({ skipped: true });
        })
        .then(result => {
            deletePicResult = result;
            console.log('Delete picture result:', deletePicResult);
            
            if (
                (personalResult && !personalResult.skipped) ||
                (passwordResult && !passwordResult.skipped) ||
                (otpResult && !otpResult.skipped) ||
                (profilePicResult && !profilePicResult.skipped) ||
                (deletePicResult && !deletePicResult.skipped)
            ) {
                showNotification('Settings updated successfully', 'success');
            } else {
                showNotification('No changes were made', 'info');
            }
            
            emailInput.setAttribute('data-original-email', emailInput.value);
            emailInput.classList.remove('verified-email');
            emailInput.removeAttribute('readonly');
            verifyEmailBtn.textContent = 'Verify';
            verifyEmailBtn.style.backgroundColor = '';
            verifyEmailBtn.disabled = false;
        })
        .catch(error => {
            console.error('Error in updates:', error);
            showNotification('An error occurred: ' + error.message, 'error');
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
    
    Object.keys(formData).forEach(key => { if (!formData[key]) delete formData[key]; });
    
    if (Object.keys(formData).length === 0) {
        console.log('Empty fields in settings form');
        return Promise.resolve({ skipped: true});
    }
    
    console.log("Form data being sent to backend:", JSON.stringify(formData, null, 2));

    return fetch('/api/update_profile/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(errorData => {
                if (response.status === 400 && errorData.error) {
                    alert(errorData.error);
                }
                throw new Error(errorData.error || 'Something went wrong');
            });
        }
        return response.json();
    })
    .then(data => {
        if (!data.success) {
            alert('Error: ', data.error);
            throw new Error(data.error);
        }
        return data;
    })
    .catch(error => {
        showNotification(error.message, 'error');
        return Promise.reject(error);
    });
}

function validateForm() {
    return true; // Add actual validation logic here
}

function updatePassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('change-newPassword').value;
    const confirmPassword = document.getElementById('change-confirmPassword').value;

    if (!currentPassword || !newPassword || newPassword !== confirmPassword) {
        alert('Check your password inputs');
        return Promise.reject(new Error('Check your password inputs'));
    }

    return fetch('/api/check_settings_password/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 'password': currentPassword })
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(errorData => {
                throw new Error(errorData.error || 'Password check failed');
            });
        }
        return response.json();
    })
    .then(data => {
        if (!data.success) {
            alert('Current password incorrect');
            throw new Error(data.error || 'Current password incorrect');
        }
        return fetch('/api/modify_password/', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, new_password: confirmPassword })
        });
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(errorData => {
                throw new Error(errorData.error || 'Password update failed');
            });
        }
        return response.json();
    })
    .then(data => {
        if (!data.success) {
            throw new Error(data.error || 'Password update failed');
        }
        return data;
    })
    .catch(error => {
        showNotification(error.message, 'error');
        return Promise.reject(error);
    });
}

function updateOTPSetting() {
    const enableOTP = document.getElementById('change-otpLogin').checked;
    return fetch('/api/profile/', { method: 'GET', credentials: 'include' })
    .then(response => response.json())
    .then(data => {
        if (data.two_factor_enabled !== enableOTP) {
            return fetch(enableOTP ? '/api/enable_2fa/' : '/api/disable_2fa/', { 
                method: 'POST', 
                credentials: 'include'
            })
            .then(response => response.json())
            .then(data => {
                showNotification(data.success ? '2FA settings updated' : 'Error: ' + data.error, data.success ? 'success' : 'error');
                return data;
            }); 
        }
        return Promise.resolve({ skipped: true });
    })
    .catch(error => console.error('Fetch error:', error.message));
}

function updateProfilePicture() {
    const file = fileInput.files[0];
    
    if (!file) {
        return Promise.resolve({ skipped: true });
    }
    
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
        layoutShowError('File is too large. Maximum 10MB allowed.', false);
        return Promise.reject(new Error('File too large'));
    }
    
    const formData = new FormData();
    formData.append('profile_picture', file);
    
    const BASE_URL = 'https://localhost:8443';
    
    return fetch('/api/add_pfp/', {
        method: 'POST',
        credentials: 'include',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            return response.text().then(text => {
                let errorMessage = 'Profile picture update failed';
                try {
                    const errorData = JSON.parse(text);
                    errorMessage = errorData.error || errorMessage;
                } catch (e) {
                    errorMessage = `Server error (${response.status}): ${text.slice(0, 100)}`;
                }
                throw new Error(errorMessage);
            });
        }
        return response.json();
    })
    .then(data => {
        if (!data.success) {
            throw new Error(data.error || 'Profile picture update failed');
        }
        if (profileImage) {
            let imageUrl = data.url || '/media/' + file.name;
            if (!imageUrl.startsWith('http')) {
                imageUrl = `${BASE_URL}/api${imageUrl}`;
            }
            profileImage.src = imageUrl;
        }
        return { success: true, message: data.message };
    })
    .catch(error => {
        console.error('Full error details:', error);
        layoutShowError(error.message, false);
        return Promise.reject(error);
    });
}

function deleteProfilePicture() {
    return fetch('/api/del_pfp/', {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
    })
    .then(response => {
        if (!response.ok) {
            return response.text().then(text => {
                let errorMessage = 'Profile picture deletion failed';
                try {
                    const errorData = JSON.parse(text);
                    errorMessage = errorData.error || errorMessage;
                } catch (e) {
                    errorMessage = `Server error (${response.status}): ${text.slice(0, 100)}`;
                }
                throw new Error(errorMessage);
            });
        }
        return response.json();
    })
    .then(data => {
        if (!data.success) {
            throw new Error(data.error || 'Profile picture deletion failed');
        }
        return { success: true, message: data.message };
    })
    .catch(error => {
        console.error('Deletion error:', error);
        layoutShowError(error.message, false);
        return Promise.reject(error);
    });
}

function showNotification(message, type = 'success') {
    console.log(type + ': ' + message);
}
}