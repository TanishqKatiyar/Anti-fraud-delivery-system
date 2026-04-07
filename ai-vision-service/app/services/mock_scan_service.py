"""
app/services/mock_scan_service.py

Demo-mode mock for the Omni-Scanner pipeline.

When DEMO_MODE=true this replaces the real YOLO + OCR + S3 pipeline so the
entire system can be demonstrated without a GPU, RTSP cameras, or AWS.

Behaviour:
  - 75% of scans → APPROVED
  - 15% → REJECTED_EXPIRED
  - 10% → REJECTED_WRONG_ITEM
  - Generates a coloured PNG "proof image" encoded as base64 data-URI
  - Returns the full response dict that omni_scan router expects
"""

import base64
import io
import os
import random
import logging
from datetime import date, timedelta

from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger("mock_scan_service")

# Weighted outcomes: (scanStatus, weight)
_OUTCOMES = [
    ("APPROVED", 75),
    ("REJECTED_EXPIRED", 15),
    ("REJECTED_WRONG_ITEM", 10),
]

_YOLO_CLASSES = ["bottle", "cake", "bowl", "cup", "banana", "apple", "sandwich", "orange"]

_OUTCOME_COLORS = {
    "APPROVED": (34, 197, 94),          # green
    "REJECTED_EXPIRED": (239, 68, 68),  # red
    "REJECTED_WRONG_ITEM": (245, 158, 11),  # amber
}

_STATUS_LABELS = {
    "APPROVED": "✓ APPROVED",
    "REJECTED_EXPIRED": "✗ EXPIRED",
    "REJECTED_WRONG_ITEM": "✗ WRONG ITEM",
}


def run_mock_scan(order_id: str, product_id: str, category: str, expected_class: str) -> dict:
    """
    Simulates a full Omni-Scanner pipeline result without real AI models.

    Returns a dict matching the real omni_scan router's response schema.
    """
    # Weighted random outcome
    statuses, weights = zip(*[(s, w) for s, w in _OUTCOMES])
    scan_status = random.choices(statuses, weights=weights, k=1)[0]

    # Simulate AI fields
    detected_class = expected_class if scan_status == "APPROVED" else random.choice(_YOLO_CLASSES)
    confidence = round(random.uniform(0.72, 0.98), 4) if scan_status == "APPROVED" else round(random.uniform(0.45, 0.71), 4)

    # Simulate expiry date
    if scan_status == "REJECTED_EXPIRED":
        expiry = (date.today() - timedelta(days=random.randint(1, 180))).strftime("%m/%Y")
    else:
        expiry = (date.today() + timedelta(days=random.randint(30, 365))).strftime("%m/%Y")

    # Generate proof image data URI
    proof_data_uri = _generate_proof_image(
        scan_status=scan_status,
        product_id=product_id,
        detected_class=detected_class,
        expiry=expiry,
        confidence=confidence,
    )

    logger.info(
        f"[MOCK] order={order_id} product={product_id} → {scan_status} "
        f"(detected={detected_class}, conf={confidence:.2%})"
    )

    return {
        "scan_status": scan_status,
        "detected_class": detected_class,
        "extracted_expiry": expiry,
        "confidence": confidence,
        "proof_image_url": proof_data_uri,   # data URI instead of S3 URL in demo
        "is_mock": True,
    }


def _generate_proof_image(
    scan_status: str,
    product_id: str,
    detected_class: str,
    expiry: str,
    confidence: float,
) -> str:
    """
    Generates a coloured PNG proof image using a real base package image
    and returns it as a base64 data URI (data:image/png;base64,...).
    """
    bg_color = _OUTCOME_COLORS[scan_status]
    
    # Load realistic image based on status
    try:
        if scan_status == "APPROVED":
            img_path = "/app/assets/pristine_box.png"
        else:
            img_path = "/app/assets/tampered_box.png"
        
        # Load and resize for UI consistency
        base_img = Image.open(img_path).convert("RGB")
        base_img = base_img.resize((400, 300))
        img = base_img
    except Exception as e:
        logger.error(f"Failed to load real image, fallback to solid color: {e}")
        img = Image.new("RGB", (400, 300), color=(15, 15, 25))

    draw = ImageDraw.Draw(img)

    # Semi-transparent overlay for text readability
    overlay = Image.new('RGBA', img.size, (15, 15, 25, 0))
    draw_overlay = ImageDraw.Draw(overlay)
    draw_overlay.rectangle([(0, 0), (400, 80)], fill=(bg_color[0], bg_color[1], bg_color[2], 230))
    draw_overlay.rectangle([(0, 80), (250, 270)], fill=(15, 15, 25, 200))
    
    img = Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')
    draw = ImageDraw.Draw(img)

    # Header text
    label = _STATUS_LABELS[scan_status]
    draw.text((20, 20), label, fill=(255, 255, 255))
    draw.text((20, 50), f"Product: {product_id}", fill=(220, 220, 220))

    # Details section
    details = [
        f"Detected Class : {detected_class}",
        f"Confidence     : {confidence:.1%}",
        f"Expiry Date    : {expiry}",
        f"Scan Status    : {scan_status}",
        "",
        "[ DEMO MODE MODELED ]",
    ]

    y = 100
    for line in details:
        color = bg_color if line.startswith("Scan") else (200, 200, 200)
        draw.text((20, y), line, fill=color)
        y += 28

    # Add a fake bounding box around center
    box_color = (bg_color[0], bg_color[1], bg_color[2])
    draw.rectangle([(100, 100), (300, 250)], outline=box_color, width=4)
    draw.text((105, 105), f"{detected_class} {confidence:.2f}", fill=box_color)

    # Border
    draw.rectangle([(2, 2), (397, 297)], outline=bg_color, width=3)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64}"
