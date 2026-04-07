"""
app/services/damage_service.py

OpenCV-based surface damage detection for non-grocery items.

CONCEPT:
    Items like toys, electronics, and glassware are placed inside the Omni-Scanner.
    We use edge detection and contour analysis to find unexpected sharp structural
    boundaries that indicate cracks, dents, or broken surfaces.

    Heuristic: if the ratio of "complex edge area" to total image area exceeds a
    tunable threshold, we flag the item as potentially damaged.
"""

import io
import logging

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger("damage_service")

# Percentage of image area that can be "complex edges" before we flag damage
# Tune this threshold per product category as needed
_DEFAULT_DAMAGE_THRESHOLD = 0.18


def assess_damage(image_bytes_list: list[bytes], threshold: float = _DEFAULT_DAMAGE_THRESHOLD) -> dict:
    """
    Analyse one or more camera frames for surface damage indicators.

    Approach:
        1. Convert to greyscale.
        2. Apply Gaussian blur to reduce noise.
        3. Canny edge detection.
        4. Find contours; measure total contour area vs. image area.
        5. If ratio exceeds threshold → likely damaged.

    Args:
        image_bytes_list : Raw image bytes per camera angle.
        threshold        : Max allowed edge-area ratio (0–1).

    Returns:
        {
            "damaged"        : bool,
            "max_edge_ratio" : float,    # worst-case frame ratio
            "details"        : list[dict],
        }
    """
    results = []

    for idx, raw_bytes in enumerate(image_bytes_list):
        pil_image = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
        np_image = np.array(pil_image)

        gray = cv2.cvtColor(np_image, cv2.COLOR_RGB2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blurred, threshold1=50, threshold2=150)

        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        total_contour_area = sum(cv2.contourArea(c) for c in contours)
        image_area = np_image.shape[0] * np_image.shape[1]
        edge_ratio = total_contour_area / image_area if image_area > 0 else 0

        frame_result = {
            "frame": idx,
            "contour_count": len(contours),
            "edge_ratio": round(edge_ratio, 4),
            "flagged": edge_ratio > threshold,
        }
        results.append(frame_result)
        logger.debug(f"Frame {idx}: edge_ratio={edge_ratio:.4f}, flagged={frame_result['flagged']}")

    max_edge_ratio = max((r["edge_ratio"] for r in results), default=0.0)
    any_flagged = any(r["flagged"] for r in results)

    return {
        "damaged": any_flagged,
        "max_edge_ratio": max_edge_ratio,
        "details": results,
    }
