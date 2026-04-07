/**
 * socket/cameraRouter.js
 *
 * The heart of the live zone-based camera routing system.
 *
 * CONCEPT:
 *  - Each customer connects to Socket.io and joins a room named after their orderId.
 *  - When a packer picks an item (emits `packer:item-picked`), we advance the
 *    order's zone queue pointer and push the next stream URL to the customer.
 *  - The customer's app renders the new WebRTC/HLS stream URL without rebuffering.
 *
 * SOCKET EVENT FLOW:
 *
 *   Customer App                    Packer Tablet                  Server
 *       │                               │                             │
 *       │── customer:join ──────────────────────────────────────────▶│
 *       │                               │                             │ join order room
 *       │◀── stream:init ──────────────────────────────────────────  │ first zone URL
 *       │                               │                             │
 *       │                               │── packer:item-picked ──── ▶│
 *       │                               │                             │ advance zone index
 *       │◀── stream:switch ─────────────────────────────────────── ─ │ new stream URL
 *       │                               │                             │
 *       │                               │── packer:packing-complete ─▶│
 *       │◀── stream:end ─────────────────────────────────────────── ─ │
 */

const Order = require("../models/Order");

/**
 * In-memory map to track active packer socket → orderId binding.
 * @type {Map<string, string>}  socketId → orderId
 */
const packerSessionMap = new Map();

/**
 * Initialise all Socket.io event handlers.
 * @param {import("socket.io").Server} io
 */
function initCameraRouter(io) {
  io.on("connection", (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // ── Customer: join order room ──────────────────────────────────────────
    /**
     * Payload: { orderId: string, customerId: string }
     * Joins the customer to their order room and emits the first camera stream.
     */
    socket.on("customer:join", async ({ orderId, customerId }) => {
      try {
        const order = await Order.findById(orderId).lean();
        if (!order) {
          return socket.emit("error", { message: `Order ${orderId} not found` });
        }
        if (order.customerId !== customerId) {
          return socket.emit("error", { message: "Unauthorized" });
        }

        // Join the room keyed by orderId so we can broadcast to this order
        socket.join(orderId);
        console.log(`[Socket] Customer ${customerId} joined order room: ${orderId}`);

        // Emit the first zone stream URL immediately
        const firstZone = order.zoneQueue[order.currentZoneIndex];
        socket.emit("stream:init", {
          orderId,
          zoneId: firstZone?.zoneId,
          streamUrl: firstZone?.streamUrl,
          totalZones: order.zoneQueue.length,
          currentIndex: order.currentZoneIndex,
        });
      } catch (err) {
        console.error("[Socket] customer:join error:", err.message);
        socket.emit("error", { message: "Internal server error" });
      }
    });

    // ── Packer: register tablet as active packer for an order ─────────────
    /**
     * Payload: { orderId: string }
     */
    socket.on("packer:register", ({ orderId }) => {
      packerSessionMap.set(socket.id, orderId);
      socket.join(`packer:${orderId}`);
      console.log(`[Socket] Packer ${socket.id} registered for order ${orderId}`);
    });

    // ── Packer: item has been physically picked from shelf ─────────────────
    /**
     * Payload: { orderId: string, pickedProductId: string }
     *
     * Advances the zone pointer and broadcasts the next stream URL to
     * the customer's app and the warehouse Omni-Scanner UI.
     */
    socket.on("packer:item-picked", async ({ orderId, pickedProductId }) => {
      try {
        const order = await Order.findById(orderId);
        if (!order) return;

        // Advance to next zone in queue
        const nextIndex = order.currentZoneIndex + 1;

        if (nextIndex < order.zoneQueue.length) {
          order.currentZoneIndex = nextIndex;
          await order.save();

          const nextZone = order.zoneQueue[nextIndex];

          // Push to the specific customer room
          io.to(orderId).emit("stream:switch", {
            orderId,
            pickedProductId,
            zoneId: nextZone.zoneId,
            streamUrl: nextZone.streamUrl,
            currentIndex: nextIndex,
            totalZones: order.zoneQueue.length,
          });

          console.log(
            `[Socket] Order ${orderId}: switched to zone ${nextZone.zoneId} ` +
            `(${nextIndex + 1}/${order.zoneQueue.length})`
          );
        }
      } catch (err) {
        console.error("[Socket] packer:item-picked error:", err.message);
      }
    });

    // ── Packer: all items collected, now packing ───────────────────────────
    /**
     * Payload: { orderId: string }
     *
     * Signals the customer that live zone tracking has ended and
     * the 3D packing view should begin.
     */
    socket.on("packer:packing-start", async ({ orderId }) => {
      try {
        await Order.findByIdAndUpdate(orderId, { status: "packing" });
        io.to(orderId).emit("stream:end", {
          orderId,
          message: "All items collected. Packing now in progress.",
        });
        console.log(`[Socket] Order ${orderId}: packing started`);
      } catch (err) {
        console.error("[Socket] packer:packing-start error:", err.message);
      }
    });

    // ── Packer: packing complete, bag sealed ──────────────────────────────
    /**
     * Payload: { orderId: string }
     */
    socket.on("packer:packing-complete", async ({ orderId }) => {
      try {
        await Order.findByIdAndUpdate(orderId, { status: "packed" });
        io.to(orderId).emit("order:packed", {
          orderId,
          message: "Order sealed. QR verification active.",
        });
        console.log(`[Socket] Order ${orderId}: packed and sealed`);
      } catch (err) {
        console.error("[Socket] packer:packing-complete error:", err.message);
      }
    });

    // ── Disconnect cleanup ─────────────────────────────────────────────────
    socket.on("disconnect", () => {
      packerSessionMap.delete(socket.id);
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });
}

module.exports = { initCameraRouter };
