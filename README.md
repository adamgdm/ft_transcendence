# ft_transcendence

## Description
This project is a web application that allows users to play a game of pong against each other. It also has a chat feature and a tournament system.

## How to run it
1. Clone the repository
2. Create a .env file in the root directory with the following variables:
```
POSTGRES_DB=***
POSTGRES_USER=***
POSTGRES_PASSWORD=***
POSTGRES_HOST=db
POSTGRES_PORT=5432
DJANGO_SECRET_KEY=***

EMAIL_HOST_USER=***
EMAIL_HOST_PASSWORD=***
```

As for the email variables, you can use a gmail account and enable App passwords in order to generate a password for the EMAIL_HOST_PASSWORD variable.

3. Run the following commands:
```
make
```

## How to test it
Tests can be run through any API testing tool like Postman or Insomnia. The following endpoints are available:
```
User Authentication and Profile Management
Register: POST /register/
Login: POST /login/
Login with OTP: POST /login_otp/
Enable 2FA: POST /enable_2fa/
Disable 2FA: POST /disable_2fa/
Profile: GET /profile/
Add Profile Picture: POST /add_pfp/
Modify Username: POST /modify_username/
Modify First Name: POST /modify_firstname/
Modify Last Name: POST /modify_lastname/
Modify Bio: POST /modify_bio/
Modify Email: POST /modify_email/
Modify Password: POST /modify_password/
Logout: POST /logout/
Friendship Management
Add Friend: POST /add_friend/
Remove Friend: POST /remove_friend/
Get Friends: GET /get_friends/
Accept Friend Request: POST /accept_friend/
Reject Friend Request: POST /reject_friend/
Get Friend Requests: GET /get_friend_requests/
```
