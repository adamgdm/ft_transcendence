FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

RUN mkdir -p ssl \
    && openssl req -x509 -newkey rsa:2048 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes -subj "/CN=localhost" --addext "subjectAltName=DNS:localhost"

ARG CACHEBUST=1
COPY workDir/ .

EXPOSE 8000

CMD ["bash", "-c", "sleep 10 && python3 manage.py makemigrations && python3 manage.py migrate && daphne -e ssl:8000:privateKey=ssl/key.pem:certKey=ssl/cert.pem backend.asgi:application"]