FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .

RUN apt-get update && apt-get install -y vim
RUN pip install --no-cache-dir -r requirements.txt

RUN mkdir -p ssl \
    && openssl req -x509 -newkey rsa:2048 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes -subj "/CN=localhost" --addext "subjectAltName=DNS:localhost"

ARG CACHEBUST=1
COPY workDir/ .

EXPOSE 8000

# Create an entrypoint script

COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

# Use the entrypoint script instead of direct command
ENTRYPOINT ["./entrypoint.sh"]