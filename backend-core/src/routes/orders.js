/**
 * routes/orders.js
 *
 * REST endpoints for order lifecycle management.
 *
 * POST  /api/orders              — Create an order, resolve item zones, emit initial socket event
 * GET   /api/orders/:id          — Fetch full order (with scan logs and stream URLs)
 * PATCH /api/orders/:id/status   — Update order status (warehouse internal use)
 * POST  /api/orders/:id/food-image — Add post-preparation image URL (Zomato use case)
 */

const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const Product = require("../models/Product");

// ── POST /api/orders ──────────────────────────────────────────────────────────
/**
 * Creates a new order.
 *
 * Body:
 *   customerId  : string   (required)
 *   items       : Array<{ productId: string, quantity?: number }>
 *
 * Logic:
 *  1. Fetch each product from DB to resolve its zone & stream URL.
 *  2. De-duplicate zones (if two items are in the same zone, one camera covers both).
 *  3. Build `zoneQueue` in the order the packer will visit (FIFO by zone encounter).
 *  4. Save order and emit `order:zone-assigned` to the customer socket room.
 */
router.post("/", async (req, res, next) => {
  try {
    const { customerId, items } = req.body;
    if (!customerId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "customerId and items[] are required" });
    }

    // Fetch all products in parallel
    const productIds = items.map((i) => i.productId);
    const products = await Product.find({ productId: { $in: productIds }, isActive: true });

    if (products.length !== productIds.length) {
      const foundIds = products.map((p) => p.productId);
      const missing = productIds.filter((id) => !foundIds.includes(id));
      return res.status(404).json({ error: "Products not found", missing });
    }

    // Build item list with zone camera info
    const productMap = Object.fromEntries(products.map((p) => [p.productId, p]));
    const orderItems = items.map((item) => {
      const product = productMap[item.productId];
      return {
        productId: item.productId,
        name: product.name,
        quantity: item.quantity || 1,
        zoneCamera: {
          zoneId: product.warehouseZone.zoneId,
          streamUrl: product.warehouseZone.streamUrl,
        },
      };
    });

    // Build de-duplicated zone queue (preserve encounter order)
    const seenZones = new Set();
    const zoneQueue = [];
    for (const item of orderItems) {
      const { zoneId, streamUrl } = item.zoneCamera;
      if (!seenZones.has(zoneId)) {
        seenZones.add(zoneId);
        zoneQueue.push({ zoneId, streamUrl });
      }
    }

    const order = await Order.create({
      customerId,
      items: orderItems,
      zoneQueue,
      currentZoneIndex: 0,
      status: "placed",
    });

    // Notify the customer's socket room (if they are connected) with zone info
    const io = req.app.get("io");
    io.to(order._id.toString()).emit("order:zone-assigned", {
      orderId: order._id,
      zoneQueue,
      message: "Your order is being packed. Live camera access granted.",
    });

    return res.status(201).json({ success: true, order });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/orders/:id ───────────────────────────────────────────────────────
router.get("/:id", async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate("deliveryTokenId");
    if (!order) return res.status(404).json({ error: "Order not found" });
    return res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/orders/:id/status ──────────────────────────────────────────────
router.patch("/:id/status", async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowed = ["placed", "packing", "packed", "in_transit", "delivered", "cancelled"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${allowed.join(", ")}` });
    }
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!order) return res.status(404).json({ error: "Order not found" });

    // Broadcast status change to all parties
    const io = req.app.get("io");
    io.to(req.params.id).emit("order:status-update", { orderId: req.params.id, status });

    return res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/orders/:id/food-image ──────────────────────────────────────────
/**
 * Zomato / food delivery use case.
 *
 * After the restaurant finishes cooking, they upload a final high-res image
 * of the prepared meal. The customer can fetch this via GET /api/orders/:id
 * and visually compare it to the delivered food.
 *
 * Body:
 *   postPrepImageUrl : string   (publicly accessible image URL, e.g. from S3)
 */
router.post("/:id/food-image", async (req, res, next) => {
  try {
    const { postPrepImageUrl } = req.body;
    if (!postPrepImageUrl) {
      return res.status(400).json({ error: "postPrepImageUrl is required" });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { postPrepImageUrl },
      { new: true }
    );
    if (!order) return res.status(404).json({ error: "Order not found" });

    // Notify customer app that the prep image is ready for viewing
    const io = req.app.get("io");
    io.to(req.params.id).emit("order:prep-image-ready", {
      orderId: req.params.id,
      postPrepImageUrl,
      message: "Your food has been prepared. Tap to preview.",
    });

    return res.json({ success: true, postPrepImageUrl, order });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
