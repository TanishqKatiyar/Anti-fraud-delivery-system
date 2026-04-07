"""
app/models/schemas.py

Pydantic models for request / response validation across the AI service.
"""

from enum import Enum
from typing import Optional
from pydantic import BaseModel


class ScanStatus(str, Enum):
    APPROVED = "APPROVED"
    REJECTED_EXPIRED = "REJECTED_EXPIRED"
    REJECTED_DAMAGED = "REJECTED_DAMAGED"
    REJECTED_WRONG_ITEM = "REJECTED_WRONG_ITEM"


class ProductCategory(str, Enum):
    GROCERY = "grocery"
    NON_GROCERY = "non-grocery"
    FOOD = "food"


class OmniScanResponse(BaseModel):
    """Response returned by /api/omni-scan"""
    orderId: str
    productId: str
    scanStatus: ScanStatus
    detectedClass: Optional[str] = None
    confidence: Optional[float] = None
    extractedExpiry: Optional[str] = None
    proofImageUrl: Optional[str] = None
    message: str


class ScanCallbackPayload(BaseModel):
    """Payload posted back to the Node.js backend /api/scan-result"""
    orderId: str
    productId: str
    scanStatus: ScanStatus
    proofImageUrl: Optional[str] = None
    detectedClass: Optional[str] = None
    extractedExpiry: Optional[str] = None
    confidence: Optional[float] = None
