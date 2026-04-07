/**
 * routes/scanResult.js
 *
 * Receives callback from the Python AI vision microservice after
 * each Omni-Scanner scan and fans the result out to:
 *  1. MongoDB (persisted ScanLog entry on the Order)
 *  2. The warehouse packer UI (green/red signal via Socket.io)
 *  3. The customer app (proof image + verdict)
 *
 * POST /api/scan-result
 */

const express = require("express");
const router = express.Router();
const Order = require("../models/Order");

// ── POST /api/scan-result ─────────────────────────────────────────────────────
/**
 * Body (sent by AI microservice):
 * {
 *   orderId        : string,
 *   productId      : string,
 *   scanStatus     : "APPROVED" | "REJECTED_EXPIRED" | "REJECTED_DAMAGED" | "REJECTED_WRONG_ITEM",
 *   proofImageUrl  : string | null,   // S3 URL of composited proof image
 *   detectedClass  : string | null,   // YOLO class detected
 *   extractedExpiry: string | null,   // OCR-extracted expiry date string
 *   confidence     : number | null,   // YOLO confidence 0-1
 * }
 */
router.post("/scan-result", async (req, res, next) => {
  try {
    const {
      orderId,
      productId,
      scanStatus,
      proofImageUrl = null,
      detectedClass = null,
      extractedExpiry = null,
      confidence = null,
    } = req.body;

    // Basic validation
    const allowedStatuses = ["APPROVED", "REJECTED_EXPIRED", "REJECTED_DAMAGED", "REJECTED_WRONG_ITEM"];
    if (!orderId || !productId || !allowedStatuses.includes(scanStatus)) {
      return res.status(400).json({
        error: "orderId, productId, and a valid scanStatus are required",
      });
    }

    // Append scan result to OrderScanLog
    const logEntry = { productId, scanStatus, proofImageUrl, scannedAt: new Date() };
    const order = await Order.findByIdAndUpdate(
      orderId,
      { $push: { scanLogs: logEntry } },
      { new: true }
    );

    if (!order) return res.status(404).json({ error: "Order not found" });

    const io = req.app.get("io");

    // Determine UI signal color
    const isApproved = scanStatus === "APPROVED";
    const uiSignal = isApproved ? "GREEN" : "RED";

    // Emit to the PACKER TABLET (warehouse UI) for the physical green/red light
    io.to(`packer:${orderId}`).emit("scanner:result", {
      orderId,
      productId,
      status: scanStatus,
      signal: uiSignal,
      detectedClass,
      extractedExpiry,
      confidence,
      proofImageUrl,
      message: getScanMessage(scanStatus, detectedClass, extractedExpiry),
    });

    // Emit to the CUSTOMER APP so they see visual proof
    io.to(orderId).emit("scan:proof", {
      orderId,
      productId,
      status: scanStatus,
      proofImageUrl,
      message: isApproved
        ? "✅ Item verified and approved for packing."
        : `⚠️ Item flagged: ${scanStatus.replace(/_/g, " ")}`,
    });

    console.log(`[ScanResult] Order ${orderId} | Product ${productId} | ${scanStatus} | ${uiSignal}`);

    return res.json({ success: true, signal: uiSignal, logEntry });
  } catch (err) {
    next(err);
  }
});

/**
 * Returns a human-readable message for the warehouse tablet display.
 */
function getScanMessage(status, detectedClass, extractedExpiry) {
  switch (status) {
    case "APPROVED":
      return `Approved${detectedClass ? ` — detected: ${detectedClass}` : ""}`;
    case "REJECTED_EXPIRED":
      return `REJECTED — Expiry date ${extractedExpiry || "unknown"} has passed`;
    case "REJECTED_DAMAGED":
      return "REJECTED — Item shows signs of damage or defects";
    case "REJECTED_WRONG_ITEM":
      return `REJECTED — Expected item mismatch${detectedClass ? `, detected: ${detectedClass}` : ""}`;
    default:
      return "Unknown scan status";
  }
}

module.exports = router;
