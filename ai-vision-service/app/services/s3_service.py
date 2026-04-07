"""
app/services/s3_service.py

AWS S3 upload service for Omni-Scanner proof images.

Composites multiple camera frames (top, bottom, left, right) into a single
horizontal strip image and uploads it to S3 as immutable tamper-proof evidence.
The returned URL is stored in the ScanLog entry in MongoDB.
"""

import io
import logging
import os
from typing import Optional

import boto3
from botocore.exceptions import ClientError
from PIL import Image

logger = logging.getLogger("s3_service")

_s3_client = None


def _get_client():
    """Lazy-init boto3 client (avoids import cost if S3 is not configured)."""
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            region_name=os.getenv("AWS_REGION", "ap-south-1"),
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        )
    return _s3_client


def upload_proof_image(
    order_id: str,
    product_id: str,
    image_bytes_list: list[bytes],
    scan_status: str,
) -> Optional[str]:
    """
    Composite frames into a proof strip and upload to S3.

    Layout: all frames placed side-by-side horizontally, resized to equal height.

    Args:
        order_id         : MongoDB order ID string.
        product_id       : Product identifier.
        image_bytes_list : List of raw image bytes from each camera angle.
        scan_status      : Scan outcome label (appended to filename).

    Returns:
        Public S3 URL of the uploaded proof image, or None if upload fails.
    """
    if not image_bytes_list:
        return None

    bucket = os.getenv("S3_BUCKET_NAME", "anti-fraud-proofs")
    target_height = 480  # Normalise all frames to this height

    # ── Build composite strip ────────────────────────────────────────────────
    pil_frames = []
    for raw_bytes in image_bytes_list:
        img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
        aspect = img.width / img.height
        new_width = int(target_height * aspect)
        img = img.resize((new_width, target_height), Image.LANCZOS)
        pil_frames.append(img)

    total_width = sum(f.width for f in pil_frames)
    composite = Image.new("RGB", (total_width, target_height), (20, 20, 20))

    x_offset = 0
    for frame in pil_frames:
        composite.paste(frame, (x_offset, 0))
        x_offset += frame.width

    # Encode as JPEG
    buffer = io.BytesIO()
    composite.save(buffer, format="JPEG", quality=85)
    buffer.seek(0)

    # ── Upload to S3 ─────────────────────────────────────────────────────────
    # Path: proofs/{orderId}/{productId}_{scanStatus}.jpg
    s3_key = f"proofs/{order_id}/{product_id}_{scan_status}.jpg"

    try:
        _get_client().upload_fileobj(
            buffer,
            bucket,
            s3_key,
            ExtraArgs={
                "ContentType": "image/jpeg",
                # No ACL — use bucket policy for public read if needed,
                # or generate pre-signed URLs for private access
            },
        )
        region = os.getenv("AWS_REGION", "ap-south-1")
        url = f"https://{bucket}.s3.{region}.amazonaws.com/{s3_key}"
        logger.info(f"Proof image uploaded: {url}")
        return url

    except ClientError as e:
        logger.error(f"S3 upload failed for {s3_key}: {e}")
        return None  # Don't block the scan pipeline if S3 is down
