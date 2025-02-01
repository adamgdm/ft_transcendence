FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

ARG CACHEBUST=1
COPY workDir/ .

EXPOSE 8000

# Create an entrypoint script

COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

# Use the entrypoint script instead of direct command
ENTRYPOINT ["./entrypoint.sh"]