/**
 * models/Product.js
 *
 * Represents a product in the warehouse catalog.
 * Each product knows which physical zone it lives in and
 * the live camera stream URL for that zone.
 */

const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },

    /** "grocery" products get OCR expiry checks; "non-grocery" get damage assessment */
    category: {
      type: String,
      enum: ["grocery", "non-grocery", "food"],
      required: true,
    },

    /** The YOLO class label expected for this product (e.g. "bottle", "teddy bear") */
    expectedYoloClass: { type: String, default: null },

    /** Barcode / SKU for the product (used during OCR confirmation) */
    barcode: { type: String, default: null },

    /** Warehouse zone assignment */
    warehouseZone: {
      zoneId: { type: String, required: true },  // e.g. "ZONE_A3"
      /** Live RTSP or WebRTC stream URL for the warehouse camera in this zone */
      streamUrl: { type: String, required: true },
    },

    /** For groceries: stored expiry from manufacturer (secondary check) */
    expiryDate: { type: Date, default: null },

    /** Price in INR (paise) */
    pricePaise: { type: Number, default: 0 },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);
