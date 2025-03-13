export function settings() {

    const form = document.getElementById('myForm')
    let isSubmitting = false

    form.addEventListener('submit', (e) => {
        e.preventDefault()
        
        // Prevent multiple submissions
        if (isSubmitting) return
        
        if (!validateForm()) return
        
        isSubmitting = true
        // Disable submit button
        const submitBtn = form.querySelector('button[type="submit"]')
        const originalBtnText = submitBtn.textContent
        submitBtn.disabled = true
        submitBtn.textContent = 'Saving...'
        
        // Create a promise array for all requests
        const promises = []
        
        // Add personal info update if needed
        const personalInfoPromise = updatePersonalInfo()
        if (personalInfoPromise) promises.push(personalInfoPromise)
        
        // Add password update if needed
        if (document.getElementById('currentPassword').value) {
            const passwordPromise = updatePassword()
            if (passwordPromise) promises.push(passwordPromise)
        }
        
        // Add OTP update if needed
        const otpPromise = updateOTPSetting()
        if (otpPromise) promises.push(otpPromise)
        
        // When all promises are done, re-enable the form
        Promise.all(promises)
            .finally(() => {
                isSubmitting = false
                submitBtn.disabled = false
                submitBtn.textContent = originalBtnText
            });
    })

    const validateForm = () => {
        // validation logic
        return true
    }

    const updatePersonalInfo = () => {
        const formData = {
            lastName: document.getElementById('change-lastName').value,
            firstName: document.getElementById('change-firstName').value,
            userName: document.getElementById('change-userName').value,
            email: document.getElementById('change-email').value
        }
        
        // Remove empty fields
        Object.keys(formData).forEach(key => {
            if (!formData[key]) delete formData[key]
        });
        
        if (Object.keys(formData).length === 0) return

        // Send API request
        return fetch('https://localhost:8000/update_profile/', {
            method: 'POST',
            credentials: 'include',
            body: JSON.stringify(formData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Profile updated successfully');
            } else {
                showNotification('Error: ' + data.error, 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showNotification('An error occurred', 'error');
        });

    }

    const updatePassword = () => {
        const currentPassword = document.getElementById('currentPassword').value
        const newPassword = document.getElementById('change-newPassword').value
        const confirmPassword = document.getElementById('change-confirmPassword').value

        if (!currentPassword) {
            alert('Please enter your current password', 'error');
            return;
        }
    
        if (!newPassword) {
            alert('Please enter a new password', 'error');
            return;
        }

        if (newPassword !== confirmPassword) {
            alert('New passwords do not match', 'error')
            return
        }

        return fetch('https://localhost:8000/modify_password/', {
            method: 'POST',
            credentials: 'include',
            body: JSON.stringify({
                currentPassword,
                new_password: confirmPassword
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Password updated successfully');
                // Clear password fields
                document.getElementById('currentPassword').value = '';
                document.getElementById('change-newPassword').value = '';
                document.getElementById('change-confirmPassword').value = '';
            } else {
                showNotification('Errorb: ' + data.error, 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showNotification('An error occurred', 'error');
        });
    }

    function updateOTPSetting() {
        const enableOTP = document.getElementById('change-otpLogin').checked;

        return fetch('https://localhost:8000/profile/', {
            method: 'GET',
            credentials: 'include'
        })
        .then(response => {
            if (response.status !== 200)
                throw new Error(`Error fetching the profile data: ${response.status}`);
            return response.json()
        })
        .then(data => {
            if (data.two_factor_enabled === enableOTP) {
                console.log('OTP didn\'t change')
                return null
            }

            return fetch(enableOTP ? 'https://localhost:8000/enable_2fa/' : 'https://localhost:8000/disable_2fa/',
                    {
                        method: 'POST',
                        credentials: 'include'
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            showNotification('2FA settings updated');
                        } else {
                            showNotification('Error: ' + data.error, 'error');
                        }
                    })
                    .catch(error => {
                        console.error('Error:', error);
                        showNotification('An error occurred', 'error');
                    });
        })
        .catch(error => console.error('Fetch error: ', error.message))
        

    }

    function showNotification(message, type = 'success') {
        // Implement notification display logic
        console.log(type + ': ' + message);
    }

        
}