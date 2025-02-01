#!/bin/bash

# Wait for Ganache and deploy contract
echo "Deploying smart contract ..."
python3 blockchain/deploy.py

# Run Django migrations

python3 manage.py makemigrations
python3 manage.py migrate

# Start the application

daphne -b 0.0.0.0 -p 8000 backend.asgi:application