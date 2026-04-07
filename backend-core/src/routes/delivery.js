/**
 * routes/delivery.js
 *
 * Handles tamper-proof QR token generation and one-time delivery verification.
 *
 * POST /api/generate-qr      — Generate HMAC-SHA256 token + QR code for the polybag
 * POST /api/verify-delivery  — Customer scans token; verifies and marks order delivered
 */

const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const QRCode = require("qrcode");
const Order = require("../models/Order");
const DeliveryToken = require("../models/DeliveryToken");

// ── POST /api/generate-qr ─────────────────────────────────────────────────────
/**
 * Called by the packing station after the bag is sealed.
 *
 * Algorithm:
 *  1. Generate a cryptographically random 32-byte nonce.
 *  2. Create an HMAC-SHA256 of (orderId + issuedAt + nonce) using QR_HMAC_SECRET.
 *  3. Store the hash + nonce in DeliveryToken collection.
 *  4. Encode the hash as a QR code data URI (for the physical label printer).
 *
 * Body: { orderId: string }
 * Returns: { tokenHash, qrDataUri, expiresAt }
 */
router.post("/generate-qr", async (req, res, next) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: "orderId is required" });

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (!["packing", "packed"].includes(order.status)) {
      return res.status(400).json({
        error: "QR can only be generated for orders in packing/packed status",
      });
    }

    // Check if a token already exists for this order (idempotent)
    const existing = await DeliveryToken.findOne({ orderId });
    if (existing && !existing.used) {
      const qrDataUri = await QRCode.toDataURL(existing.tokenHash);
      return res.json({ success: true, tokenHash: existing.tokenHash, qrDataUri, expiresAt: existing.expiresAt });
    }

    // Generate new token
    const nonce = crypto.randomBytes(32).toString("hex");
    const issuedAt = new Date().toISOString();
    const secret = process.env.QR_HMAC_SECRET;

    if (!secret) throw new Error("QR_HMAC_SECRET env variable is not set");

    const payload = `${orderId}:${issuedAt}:${nonce}`;
    const tokenHash = crypto.createHmac("sha256", secret).update(payload).digest("hex");

    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    const deliveryToken = await DeliveryToken.create({
      orderId,
      tokenHash,
      nonce,
      issuedAt,
      expiresAt,
    });

    // Link token to order
    order.deliveryTokenId = deliveryToken._id;
    await order.save();

    // Generate QR code as base64 data URI (ready to print inside the polybag)
    const qrDataUri = await QRCode.toDataURL(tokenHash, {
      errorCorrectionLevel: "H",  // highest correction — survives bag creases
      margin: 2,
      width: 512,
    });

    console.log(`[QR] Token generated for order ${orderId}: ${tokenHash.slice(0, 16)}...`);

    return res.status(201).json({
      success: true,
      tokenHash,
      qrDataUri,
      expiresAt,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/verify-delivery ─────────────────────────────────────────────────
/**
 * Called by the customer app after tearing the polybag and scanning the QR code.
 *
 * Verification steps:
 *  1. Look up the tokenHash in DeliveryToken collection.
 *  2. Ensure it's not already used (replay-attack prevention).
 *  3. Ensure it hasn't expired.
 *  4. Verify the orderId matches the token's linked order.
 *  5. Mark token as used, update order status to "delivered".
 *  6. Emit `order:delivered` socket event to all parties.
 *
 * Body: { token: string, orderId: string }
 * Returns: { status: "VERIFIED" } | 400 { status: "INVALID_TOKEN" | "TOKEN_EXPIRED" | "ALREADY_USED" }
 */
router.post("/verify-delivery", async (req, res, next) => {
  try {
    const { token, orderId } = req.body;
    if (!token || !orderId) {
      return res.status(400).json({ error: "token and orderId are required" });
    }

    const deliveryToken = await DeliveryToken.findOne({ tokenHash: token });

    if (!deliveryToken) {
      return res.status(400).json({ status: "INVALID_TOKEN", message: "QR code not recognised. Possible tampering." });
    }

    if (deliveryToken.orderId.toString() !== orderId) {
      return res.status(400).json({ status: "INVALID_TOKEN", message: "Token does not match this order." });
    }

    if (deliveryToken.used) {
      return res.status(400).json({
        status: "ALREADY_USED",
        message: "This QR code has already been scanned. Contact support if you have not done this.",
        usedAt: deliveryToken.usedAt,
      });
    }

    if (new Date() > deliveryToken.expiresAt) {
      return res.status(400).json({ status: "TOKEN_EXPIRED", message: "QR code has expired. Contact support." });
    }

    // ✅ All checks passed — mark as used and deliver
    deliveryToken.used = true;
    deliveryToken.usedAt = new Date();
    await deliveryToken.save();

    const order = await Order.findByIdAndUpdate(
      orderId,
      { status: "delivered" },
      { new: true }
    );

    // Broadcast to customer app and warehouse dashboard
    const io = req.app.get("io");
    io.to(orderId).emit("order:delivered", {
      orderId,
      message: "Delivery confirmed. Thank you!",
      deliveredAt: deliveryToken.usedAt,
    });

    console.log(`[Delivery] Order ${orderId} verified and delivered ✅`);

    return res.json({
      status: "VERIFIED",
      message: "Delivery confirmed successfully.",
      order,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
