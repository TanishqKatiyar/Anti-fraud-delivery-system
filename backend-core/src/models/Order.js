/**
 * models/Order.js
 *
 * Represents a customer order from placement through delivery.
 * Tracks every zone visited, scan decisions, and the delivery token.
 */

const mongoose = require("mongoose");

// ── Sub-schemas ──────────────────────────────────────────────────────────────

/** Each item line in an order */
const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true },
    name: { type: String, required: true },
    quantity: { type: Number, default: 1 },
    /** The warehouse zone camera assigned to this product */
    zoneCamera: {
      zoneId: String,
      /** WebRTC/RTSP stream URL for the customer live feed */
      streamUrl: String,
    },
  },
  { _id: false }
);

/** A single scan log entry written by the AI microservice callback */
const scanLogEntrySchema = new mongoose.Schema(
  {
    productId: { type: String },
    scanStatus: {
      type: String,
      enum: ["APPROVED", "REJECTED_EXPIRED", "REJECTED_DAMAGED", "REJECTED_WRONG_ITEM"],
    },
    proofImageUrl: { type: String, default: null }, // S3 URL
    scannedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// ── Main Order Schema ────────────────────────────────────────────────────────

const orderSchema = new mongoose.Schema(
  {
    customerId: { type: String, required: true, index: true },

    /** Flat array of items (populated on order creation) */
    items: { type: [orderItemSchema], required: true },

    /**
     * Ordered list of zone stream URLs derived from item zones.
     * The packer walks through this queue; Socket.io pushes each URL
     * to the customer as each item is picked.
     */
    zoneQueue: [{ zoneId: String, streamUrl: String }],

    /** Index into zoneQueue representing the currently active camera */
    currentZoneIndex: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["placed", "packing", "packed", "in_transit", "delivered", "cancelled"],
      default: "placed",
    },

    /** Reference to the one-time delivery verification token */
    deliveryTokenId: { type: mongoose.Schema.Types.ObjectId, ref: "DeliveryToken" },

    /** All Omni-Scanner decisions for this order */
    scanLogs: { type: [scanLogEntrySchema], default: [] },

    /**
     * Zomato / food delivery use case:
     * URL of the final high-res image of the prepared meal captured
     * at the restaurant and sent to the customer for visual matching.
     */
    postPrepImageUrl: { type: String, default: null },

    /** Notes added by the packer or system */
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
