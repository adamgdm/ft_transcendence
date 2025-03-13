export function settings() {
        const verifyEmailBtn = document.getElementById('verify-email-btn');
        const verificationBox = document.getElementById('verification-box');
        const submitCodeBtn = document.getElementById('submit-code-btn');
        const emailInput = document.getElementById('change-email');
        const codeInput = document.getElementById('verification-code');
        const verificationMessage = document.getElementById('verification-message');
        
        // When verify button is clicked
        verifyEmailBtn.addEventListener('click', function() {
            // Validate email first
            const email = emailInput.value.trim();
            if (!email || !isValidEmail(email)) {
                alert('Please enter a valid email address');
                return;
            }
            
            // Toggle verification box
            if (verificationBox.style.display === 'block') {
                // If already showing, we're in "resend" mode
                sendVerificationCode(email);
                verificationMessage.textContent = 'Verification code resent';
                verificationMessage.className = 'success-message';
            } else {
                // Show verification box
                verificationBox.style.display = 'block';
                // Send verification code
                sendVerificationCode(email);
            }
            
            // Change button text to "Resend"
            verifyEmailBtn.textContent = 'Resend';
        });
        
        // When submit code button is clicked
        submitCodeBtn.addEventListener('click', function() {
            const code = codeInput.value.trim();
            if (!code) {
                verificationMessage.textContent = 'Please enter the verification code';
                verificationMessage.className = 'error-message';
                return;
            }
            
            verifyCode(code);
        });
        
        // When clicking outside the verification box, hide it if email isn't verified
        document.addEventListener('click', function(event) {
            const isClickInsideVerification = verificationBox.contains(event.target) || 
                                              verifyEmailBtn.contains(event.target);
            
            if (!isClickInsideVerification && verificationBox.style.display === 'block' && 
                !emailInput.classList.contains('verified-email')) {
                verificationBox.style.display = 'none';
                verifyEmailBtn.textContent = 'Verify';
            }
        });
        
        // Simple email validation function
        function isValidEmail(email) {
            const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return re.test(email);
        }
        
        // Function to send verification code
        function sendVerificationCode(email) {
            // In a real application, you would send an API request here
            console.log('Sending verification code to: ' + email);
            
            // For demo purposes, we'll just show a message
            verificationMessage.textContent = 'Verification code sent to your email';
            verificationMessage.className = 'success-message';
        }
        
        // Function to verify the code
        function verifyCode(code) {
            // For demo purposes, we'll check if code is "123456"
            // In a real application, you would verify with your backend
            if (code === '123456') {
                // Successful verification
                verificationMessage.textContent = 'Email verified successfully!';
                verificationMessage.className = 'success-message';
                
                // Make email input readonly and style it as verified
                emailInput.setAttribute('readonly', true);
                emailInput.classList.add('verified-email');
                
                // Change verify button to show verified state
                verifyEmailBtn.textContent = 'Verified';
                verifyEmailBtn.style.backgroundColor = '#4CAF50';
                verifyEmailBtn.disabled = true;
                
                // Hide verification box after a short delay
                setTimeout(function() {
                    verificationBox.style.display = 'none';
                }, 2000);
                
                // Here you would typically update the user's profile in your backend
                // to mark their email as verified
                console.log('Email verification successful - update backend');
            } else {
                // Failed verification
                verificationMessage.textContent = 'Invalid code. Please try again.';
                verificationMessage.className = 'error-message';
            }
        }
    
}