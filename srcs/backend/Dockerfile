FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

ARG CACHEBUST=1
COPY workDir/ .

EXPOSE 8000

CMD ["bash", "-c", "sleep 10 && python3 manage.py makemigrations && python3 manage.py migrate && daphne -b 0.0.0.0 -p 8000 backend.asgi:application"]