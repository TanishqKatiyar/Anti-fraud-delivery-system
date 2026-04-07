/**
 * server.js — Anti-Fraud Supply Chain System: Backend Core
 *
 * Bootstraps Express, attaches Socket.io, connects to MongoDB,
 * and mounts all API route modules.
 */

require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");

const path = require("path");
const { initCameraRouter } = require("./src/socket/cameraRouter");
const ordersRouter = require("./src/routes/orders");
const deliveryRouter = require("./src/routes/delivery");
const scanResultRouter = require("./src/routes/scanResult");
const productsRouter = require("./src/routes/products");
const errorHandler = require("./src/middleware/errorHandler");

const app = express();
const server = http.createServer(app);

// ─── Socket.io ────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Make `io` accessible inside route handlers via req.app.get("io")
app.set("io", io);

// Initialise the camera-zone routing logic on the Socket.io instance
initCameraRouter(io);

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/orders", ordersRouter);
app.use("/api/products", productsRouter);
app.use("/api", deliveryRouter);       // /api/generate-qr & /api/verify-delivery
app.use("/api", scanResultRouter);     // /api/scan-result  (AI service callback)

// Health check
app.get("/health", (_req, res) => res.json({ status: "OK", service: "backend-core", demo: process.env.DEMO_MODE === "true" }));

// ─── Serve Frontend (production) ──────────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
  const frontendDist = path.resolve(__dirname, "../frontend/dist");
  app.use(express.static(frontendDist));
  app.get("*", (_req, res) => res.sendFile(path.join(frontendDist, "index.html")));
}

// Central error handler (always last)
app.use(errorHandler);

// ─── MongoDB ──────────────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅  MongoDB connected"))
  .catch((err) => {
    console.error("❌  MongoDB connection error:", err.message);
    process.exit(1);
  });

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀  Backend-core running on http://localhost:${PORT}`);
});
