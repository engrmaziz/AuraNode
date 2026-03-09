# syntax=docker/dockerfile:1

###############################################################################
# Stage 1 — Base image with system dependencies
###############################################################################
FROM python:3.11-slim AS base

# Prevent Python from writing pyc files and buffering stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install OS-level dependencies required for Tesseract OCR and image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    poppler-utils \
    ghostscript \
    && rm -rf /var/lib/apt/lists/*

###############################################################################
# Stage 2 — Python dependencies
###############################################################################
FROM base AS dependencies

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

###############################################################################
# Stage 3 — Application
###############################################################################
FROM dependencies AS app

WORKDIR /app

# Copy application source code
COPY . .

# Create a non-root user for security
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
USER appuser

# Expose application port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/health').raise_for_status()"

# Start the server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
