FROM python:3.11-slim

# Install ffmpeg (required by pydub for audio format conversion)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD uvicorn server:app --host 0.0.0.0 --port ${PORT:-8001}
