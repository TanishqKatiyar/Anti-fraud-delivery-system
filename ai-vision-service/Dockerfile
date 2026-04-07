FROM python:3.11-slim
WORKDIR /app
# Install only the minimal deps needed for demo mode (no torch/ultralytics)
COPY requirements.txt ./
RUN pip install --no-cache-dir fastapi uvicorn[standard] httpx Pillow python-multipart numpy pydantic-settings opencv-python-headless boto3
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
