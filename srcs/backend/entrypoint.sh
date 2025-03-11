#!/bin/bash

# Wait for Ganache and deploy contract
echo "Deploying smart contract ..."
python3 blockchain/deploy.py

# Run Django migrations

python3 manage.py makemigrations
python3 manage.py migrate

# Start the application

daphne -e ssl:8000:privateKey=ssl/key.pem:certKey=ssl/cert.pem backend.asgi:application