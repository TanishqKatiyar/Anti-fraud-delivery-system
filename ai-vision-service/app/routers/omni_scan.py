"""
app/routers/omni_scan.py

POST /api/omni-scan — The core Omni-Scanner endpoint.

Accepts multiple image frames from the 4-camera glass scanner box,
runs the full AI verification pipeline, uploads proof to S3, and
posts the result back to the Node.js backend via HTTP callback.

Pipeline (in order):
    1.  YOLO product identity check
    2a. [grocery]     OCR expiry date extraction + expiry check
    2b. [non-grocery] OpenCV surface damage assessment
    3.  S3 proof image upload
    4.  HTTP callback → Node.js /api/scan-result
"""

import logging
import os
from typing import List

import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.models.schemas import OmniScanResponse, ScanStatus, ProductCategory
from app.services import yolo_service, ocr_service, damage_service, s3_service

router = APIRouter()
logger = logging.getLogger("omni_scan")

CORE_BACKEND_URL = os.getenv("CORE_BACKEND_URL", "http://localhost:5000")


@router.post("/omni-scan", response_model=OmniScanResponse)
async def omni_scan(
    orderId: str = Form(..., description="MongoDB Order ID"),
    productId: str = Form(..., description="Product identifier"),
    category: ProductCategory = Form(..., description="grocery | non-grocery | food"),
    expectedClass: str = Form(..., description="Expected YOLO class label (e.g. 'bottle', 'teddy bear')"),
    frames: List[UploadFile] = File(..., description="One or more camera frame images"),
):
    """
    Multi-stage AI product verification for the Omni-Scanner glass chamber.

    - Reads up to 4 image frames (top/bottom/left/right cameras).
    - Runs YOLO identity check → OCR expiry (grocery) or damage (non-grocery).
    - Uploads composited proof image to S3.
    - Fires HTTP callback to Node.js backend so Socket.io pushes green/red to UIs.

    Returns the scan verdict synchronously so the packing station tablet
    can also display the result without depending on the callback.
    """
    if not frames:
        raise HTTPException(status_code=400, detail="At least one frame image is required")

    # ── DEMO MODE: bypass all real AI models ──────────────────────────────────
    if os.getenv("DEMO_MODE", "false").lower() == "true":
        from app.services.mock_scan_service import run_mock_scan
        mock = run_mock_scan(
            order_id=orderId,
            product_id=productId,
            category=category.value,
            expected_class=expectedClass,
        )
        # Fire callback to Node.js (same as real path)
        callback_payload = {
            "orderId": orderId,
            "productId": productId,
            "scanStatus": mock["scan_status"],
            "proofImageUrl": mock["proof_image_url"],
            "detectedClass": mock["detected_class"],
            "extractedExpiry": mock["extracted_expiry"],
            "confidence": mock["confidence"],
        }
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(f"{CORE_BACKEND_URL}/api/scan-result", json=callback_payload)
        except httpx.RequestError as e:
            logger.warning(f"[DEMO] Callback failed (non-fatal): {e}")

        from app.models.schemas import ScanStatus as SS
        return OmniScanResponse(
            orderId=orderId,
            productId=productId,
            scanStatus=SS(mock["scan_status"]),
            detectedClass=mock["detected_class"],
            confidence=mock["confidence"],
            extractedExpiry=mock["extracted_expiry"],
            proofImageUrl=mock["proof_image_url"],
            message=f"[DEMO] {mock['scan_status']} — detected: {mock['detected_class']}",
        )

    # Read all frame bytes (async)
    image_bytes_list = [await f.read() for f in frames]

    scan_status: ScanStatus
    detected_class: str | None = None
    confidence: float | None = None
    extracted_expiry: str | None = None
    proof_url: str | None = None

    # ── Stage 1: YOLO Product Identity Check ──────────────────────────────────
    logger.info(f"[{orderId}] Stage 1: YOLO identity check for '{productId}' (expected: '{expectedClass}')")
    yolo_result = yolo_service.verify_product(
        image_bytes_list=image_bytes_list,
        expected_class=expectedClass,
    )
    detected_class = yolo_result["detected_class"]
    confidence = yolo_result["confidence"]

    if not yolo_result["match"]:
        scan_status = ScanStatus.REJECTED_WRONG_ITEM
        logger.warning(f"[{orderId}] YOLO mismatch: expected '{expectedClass}', got '{detected_class}'")
    else:
        # ── Stage 2a: OCR Expiry Check (groceries) ────────────────────────────
        if category == ProductCategory.GROCERY:
            logger.info(f"[{orderId}] Stage 2a: OCR expiry check")
            ocr_result = ocr_service.extract_expiry_date(image_bytes_list)
            extracted_expiry = ocr_result["date_string"]

            if ocr_result["is_expired"]:
                scan_status = ScanStatus.REJECTED_EXPIRED
                logger.warning(f"[{orderId}] Expired item detected: {extracted_expiry}")
            else:
                scan_status = ScanStatus.APPROVED
                logger.info(f"[{orderId}] Expiry OK: {extracted_expiry or 'not detected (OK)'}")

        # ── Stage 2b: Damage Assessment (non-grocery / food) ─────────────────
        else:
            logger.info(f"[{orderId}] Stage 2b: OpenCV damage assessment")
            dmg_result = damage_service.assess_damage(image_bytes_list)

            if dmg_result["damaged"]:
                scan_status = ScanStatus.REJECTED_DAMAGED
                logger.warning(
                    f"[{orderId}] Damage detected: max edge ratio = {dmg_result['max_edge_ratio']}"
                )
            else:
                scan_status = ScanStatus.APPROVED
                logger.info(f"[{orderId}] No damage detected — edge ratio {dmg_result['max_edge_ratio']:.4f}")

    # ── Stage 3: Upload proof image to S3 ────────────────────────────────────
    logger.info(f"[{orderId}] Stage 3: Uploading proof image to S3")
    proof_url = s3_service.upload_proof_image(
        order_id=orderId,
        product_id=productId,
        image_bytes_list=image_bytes_list,
        scan_status=scan_status.value,
    )

    # ── Stage 4: Callback to Node.js backend ─────────────────────────────────
    callback_payload = {
        "orderId": orderId,
        "productId": productId,
        "scanStatus": scan_status.value,
        "proofImageUrl": proof_url,
        "detectedClass": detected_class,
        "extractedExpiry": extracted_expiry,
        "confidence": confidence,
    }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            cb_response = await client.post(
                f"{CORE_BACKEND_URL}/api/scan-result",
                json=callback_payload,
            )
            if cb_response.status_code != 200:
                logger.error(
                    f"[{orderId}] Callback to Node.js returned {cb_response.status_code}: {cb_response.text}"
                )
    except httpx.RequestError as e:
        # Non-fatal — the scan result is still returned to the caller
        logger.error(f"[{orderId}] Failed to post scan callback: {e}")

    # Build human-readable message
    message = _build_message(scan_status, detected_class, extracted_expiry)
    logger.info(f"[{orderId}] Scan complete: {scan_status.value} — {message}")

    return OmniScanResponse(
        orderId=orderId,
        productId=productId,
        scanStatus=scan_status,
        detectedClass=detected_class,
        confidence=confidence,
        extractedExpiry=extracted_expiry,
        proofImageUrl=proof_url,
        message=message,
    )


def _build_message(status: ScanStatus, detected_class: str | None, expiry: str | None) -> str:
    match status:
        case ScanStatus.APPROVED:
            return f"Item approved{f' — detected: {detected_class}' if detected_class else ''}."
        case ScanStatus.REJECTED_EXPIRED:
            return f"Item rejected — expiry date '{expiry or 'unknown'}' has passed."
        case ScanStatus.REJECTED_DAMAGED:
            return "Item rejected — surface damage or defects detected."
        case ScanStatus.REJECTED_WRONG_ITEM:
            return f"Item rejected — expected product mismatch{f' (detected: {detected_class})' if detected_class else ''}."
        case _:
            return "Unknown scan result."
