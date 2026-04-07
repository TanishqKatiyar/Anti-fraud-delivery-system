/**
 * routes/products.js
 *
 * Product catalogue endpoints used by the frontend.
 *
 * GET  /api/products          — List all active products
 * GET  /api/products/:id      — Fetch single product
 * POST /api/products          — Create a product (admin / seeder)
 * DELETE /api/products/:id    — Soft-delete a product (admin)
 */

const express = require("express");
const router = express.Router();
const Product = require("../models/Product");

// ── GET /api/products ─────────────────────────────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const { category, zone } = req.query;
    const filter = { isActive: true };
    if (category) filter.category = category;
    if (zone) filter["warehouseZone.zoneId"] = zone;

    const products = await Product.find(filter).sort({ name: 1 });
    return res.json({ success: true, count: products.length, products });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/products/:id ─────────────────────────────────────────────────────
router.get("/:id", async (req, res, next) => {
  try {
    const product = await Product.findOne({ productId: req.params.id, isActive: true });
    if (!product) return res.status(404).json({ error: "Product not found" });
    return res.json({ success: true, product });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/products ────────────────────────────────────────────────────────
router.post("/", async (req, res, next) => {
  try {
    const {
      productId, name, category, expectedClass,
      warehouseZone, imageUrl, price,
    } = req.body;

    if (!productId || !name) {
      return res.status(400).json({ error: "productId and name are required" });
    }

    const existing = await Product.findOne({ productId });
    if (existing) {
      return res.status(409).json({ error: "Product with this productId already exists" });
    }

    const product = await Product.create({
      productId, name, category, expectedClass,
      warehouseZone, imageUrl, price,
    });

    return res.status(201).json({ success: true, product });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/products/:id ──────────────────────────────────────────────────
router.delete("/:id", async (req, res, next) => {
  try {
    const product = await Product.findOneAndUpdate(
      { productId: req.params.id },
      { isActive: false },
      { new: true }
    );
    if (!product) return res.status(404).json({ error: "Product not found" });
    return res.json({ success: true, message: "Product deactivated" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
