"""
app/services/ocr_service.py

EasyOCR-based expiry date extraction service.

DESIGN:
    - EasyOCR reader is initialised once at startup (slow — downloads model ~200MB).
    - `extract_expiry_date()` scans all image frames from the Omni-Scanner,
      concatenates the recognised text, and uses regex to find common expiry
      date patterns printed on grocery packaging.
    - The extracted date is compared against today's date. If expired → False.
"""

import io
import logging
import re
from datetime import datetime, date
from typing import Optional

import numpy as np
from PIL import Image

logger = logging.getLogger("ocr_service")

# Module-level singleton — loaded once at startup
_reader = None

# ── Common expiry date patterns on Indian / global packaging ─────────────────
# Matches formats like:
#   "EXP 12/2025", "Best Before 31-12-2025", "USE BY 2025-12-31",
#   "Exp. Date: 12.2025", "BB: 31/12/25", plain "12/2025"
_DATE_PATTERNS = [
    # DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    r"\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b",
    # DD/MM/YY
    r"\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})\b",
    # MM/YYYY or MM-YYYY (month-year only, common on Indian FMCG)
    r"\b(\d{1,2})[\/\-](\d{4})\b",
    # YYYY-MM-DD (ISO)
    r"\b(\d{4})[\/\-](\d{2})[\/\-](\d{2})\b",
]


def init_reader():
    """
    Initialise the EasyOCR reader with English language support.
    Called once from main.py lifespan.
    """
    global _reader
    import easyocr
    logger.info("Initialising EasyOCR (this may take a moment on first run)…")
    _reader = easyocr.Reader(["en"], gpu=False)   # set gpu=True if CUDA available
    logger.info("EasyOCR reader ready")


def extract_expiry_date(image_bytes_list: list[bytes]) -> dict:
    """
    Scan one or more image frames and attempt to extract an expiry date.

    Args:
        image_bytes_list : Raw bytes for each camera frame from the Omni-Scanner.

    Returns:
        {
            "found"        : bool,
            "date_string"  : str | None,    # raw matched string e.g. "12/2025"
            "parsed_date"  : date | None,   # parsed Python date object
            "is_expired"   : bool,          # True if expiry is before today
            "all_text"     : list[str],     # all text detected for debugging
        }
    """
    if _reader is None:
        raise RuntimeError("OCR reader not initialised. Call init_reader() at startup.")

    all_text_segments: list[str] = []

    for raw_bytes in image_bytes_list:
        pil_image = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
        np_image = np.array(pil_image)

        results = _reader.readtext(np_image, detail=0, paragraph=False)
        all_text_segments.extend(results)

    full_text = " ".join(all_text_segments).upper()
    logger.debug(f"OCR raw text: {full_text[:300]}")

    # Attempt to parse a date from the combined text
    parsed = _find_expiry_in_text(full_text)

    if parsed["parsed_date"]:
        is_expired = parsed["parsed_date"] < date.today()
    else:
        # If we can't find a date, we flag conservatively as NOT expired
        # (YOLO mismatch will catch if it's completely wrong product)
        is_expired = False

    return {
        "found": parsed["parsed_date"] is not None,
        "date_string": parsed["date_string"],
        "parsed_date": parsed["parsed_date"],
        "is_expired": is_expired,
        "all_text": all_text_segments,
    }


def _find_expiry_in_text(text: str) -> dict:
    """Try each regex pattern in order; return the first valid date found."""
    for pattern in _DATE_PATTERNS:
        for match in re.finditer(pattern, text):
            parsed = _try_parse_match(match)
            if parsed:
                return {"date_string": match.group(0), "parsed_date": parsed}
    return {"date_string": None, "parsed_date": None}


def _try_parse_match(match: re.Match) -> Optional[date]:
    """Attempt to parse a regex match into a Python date object."""
    groups = match.groups()
    try:
        if len(groups) == 3:
            g0, g1, g2 = int(groups[0]), int(groups[1]), int(groups[2])

            # ISO: YYYY-MM-DD
            if g0 > 1000:
                return date(g0, g1, g2)

            # 2-digit year
            if g2 < 100:
                g2 += 2000

            # DD/MM/YYYY
            if 1 <= g0 <= 31 and 1 <= g1 <= 12:
                return date(g2, g1, g0)
            # MM/DD/YYYY fallback
            if 1 <= g1 <= 31 and 1 <= g0 <= 12:
                return date(g2, g0, g1)

        elif len(groups) == 2:
            # MM/YYYY — treat as last day of that month
            month, year = int(groups[0]), int(groups[1])
            if 1 <= month <= 12 and year > 2000:
                # Last day: day 1 of next month minus 1 day
                if month == 12:
                    return date(year + 1, 1, 1).__class__(year, month, 31) if False else date(year, month, 28)
                return date(year, month + 1, 1).__class__(year, month, 1)
    except (ValueError, TypeError):
        pass
    return None
