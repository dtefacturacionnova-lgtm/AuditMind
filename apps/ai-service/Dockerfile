FROM python:3.12-slim

WORKDIR /app

# System deps — gcc for scipy/numpy compilation, libpq-dev for asyncpg
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (layer cache)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

EXPOSE 8000

# Shell form (not exec) so $PORT env var is expanded by Railway
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
