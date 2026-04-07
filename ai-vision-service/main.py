"""
main.py — AI Vision Service Entry Point

Initialises the FastAPI application, loads heavyweight ML models
at startup (once, not per-request), and mounts the omni-scan router.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import omni_scan
from app.services.yolo_service import load_model as load_yolo
from app.services.ocr_service import init_reader as init_ocr

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger("ai-vision-service")


# ── Lifespan (startup / shutdown) ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Load ML models once at process startup.
    In DEMO_MODE models are skipped entirely — the mock scan service handles all requests.
    """
    import os
    demo_mode = os.getenv("DEMO_MODE", "false").lower() == "true"

    if demo_mode:
        logger.info("⚡  DEMO_MODE=true — skipping ML model loading (using mock scan service)")
    else:
        logger.info("🔄  Loading YOLOv8 model…")
        load_yolo()
        logger.info("✅  YOLOv8 loaded")

        logger.info("🔄  Initialising EasyOCR reader…")
        init_ocr()
        logger.info("✅  EasyOCR ready")

    yield  # application runs here

    logger.info("👋  AI Vision Service shutting down")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Anti-Fraud AI Vision Service",
    description=(
        "Omni-Scanner microservice — YOLOv8 product identity, "
        "EasyOCR expiry-date extraction, and OpenCV damage assessment."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(omni_scan.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "OK", "service": "ai-vision-service"}
