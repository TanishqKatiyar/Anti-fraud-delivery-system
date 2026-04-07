"""
app/services/yolo_service.py

YOLOv8 product identity verification service.

DESIGN:
    - The model is loaded once at application startup (via main.py lifespan).
    - `verify_product()` checks whether the dominant detected object matches
      the expected product class for the order line.
    - Uses ultralytics YOLOv8n (nano) by default; swap for a custom-trained
      model by setting YOLO_MODEL_PATH in .env.
"""

import logging
import os
from typing import Optional

import numpy as np
from PIL import Image
import io

logger = logging.getLogger("yolo_service")

# Module-level singleton — loaded once, reused for all requests
_model = None


def load_model():
    """
    Load the YOLOv8 model at startup.
    Called from main.py lifespan; sets the module-level _model singleton.
    """
    global _model

    # Lazy import to avoid heavy import at module load time in tests
    from ultralytics import YOLO

    model_path = os.getenv("YOLO_MODEL_PATH") or "yolov8n.pt"
    logger.info(f"Loading YOLO model from: {model_path}")
    _model = YOLO(model_path)
    logger.info("YOLO model loaded successfully")


def verify_product(
    image_bytes_list: list[bytes],
    expected_class: str,
    confidence_threshold: Optional[float] = None,
) -> dict:
    """
    Run YOLOv8 detection on one or more image frames and verify that
    the dominant detected object matches `expected_class`.

    Args:
        image_bytes_list : List of raw image bytes (one per camera angle).
        expected_class   : The YOLO class label we expect (e.g. "bottle", "teddy bear").
        confidence_threshold : Minimum confidence to accept a detection (default from env).

    Returns:
        {
            "match": bool,
            "detected_class": str | None,   # highest-confidence detection
            "confidence": float | None,
            "all_detections": list[dict],
        }
    """
    if _model is None:
        raise RuntimeError("YOLO model not loaded. Call load_model() at startup.")

    threshold = confidence_threshold or float(os.getenv("YOLO_CONFIDENCE", "0.50"))

    best_class = None
    best_confidence = 0.0
    all_detections = []

    for raw_bytes in image_bytes_list:
        # Convert bytes → PIL Image → numpy array for YOLO
        pil_image = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
        np_image = np.array(pil_image)

        results = _model(np_image, verbose=False)

        for result in results:
            for box in result.boxes:
                cls_id = int(box.cls[0])
                conf = float(box.conf[0])
                cls_name = result.names[cls_id]

                all_detections.append({"class": cls_name, "confidence": round(conf, 4)})

                if conf > best_confidence:
                    best_confidence = conf
                    best_class = cls_name

    # Normalise class comparison (case-insensitive, strip whitespace)
    match = (
        best_class is not None
        and best_class.strip().lower() == expected_class.strip().lower()
        and best_confidence >= threshold
    )

    logger.info(
        f"YOLO verify — expected: '{expected_class}', "
        f"detected: '{best_class}' ({best_confidence:.2%}), match: {match}"
    )

    return {
        "match": match,
        "detected_class": best_class,
        "confidence": round(best_confidence, 4) if best_class else None,
        "all_detections": all_detections,
    }
