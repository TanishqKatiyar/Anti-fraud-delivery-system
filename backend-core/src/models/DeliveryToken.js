/**
 * models/DeliveryToken.js
 *
 * Stores the cryptographically hashed, one-time-use QR token
 * that is printed inside the sealed polybag. The customer must
 * tear the bag and scan this code to confirm tamper-free delivery.
 */

const mongoose = require("mongoose");

const deliveryTokenSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true,  // one token per order
      index: true,
    },

    /**
     * HMAC-SHA256 hex digest.
     * Generated as: HMAC(secret, orderId + timestamp + nonce)
     * This hash is embedded in the QR code inside the sealed bag.
     */
    tokenHash: { type: String, required: true, unique: true },

    /**
     * Plain nonce stored server-side so we can regenerate and
     * re-verify the hash without storing the raw input.
     */
    nonce: { type: String, required: true },

    /** Timestamp used during hash generation (ISO string) */
    issuedAt: { type: String, required: true },

    /** Has this token already been scanned? One-time-use enforcement. */
    used: { type: Boolean, default: false },

    /** When the token was scanned (set on successful verification) */
    usedAt: { type: Date, default: null },

    /** TTL: tokens expire 48 h after generation if not scanned */
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 48 * 60 * 60 * 1000),
    },
  },
  { timestamps: true }
);

// Auto-expire documents using MongoDB TTL index
deliveryTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("DeliveryToken", deliveryTokenSchema);
