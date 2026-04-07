---
theme: default
class: text-center
highlighter: shiki
lineNumbers: false
info: |
  ## ChainGuard Omni-Scanner
  Supply Chain Pitch Deck
---

# 🛡️ ChainGuard
**The Ultra-Transparent Anti-Fraud Supply Chain System**

Resolving the $50 Billion industry leak in delivery tampering and refund fraud.

---

# 🚨 The Problem

Modern e-commerce logistics face massive trust and verification gaps:
- 📦 **Refund Fraud:** Customers falsely claiming items were never packed or arrived damaged.
- 🚚 **Delivery Tampering:** Drivers or bad actors opening packages mid-transit.
- 💸 **Expired Goods:** Warehouses accidentally shipping expired or incorrect SKUs leading to high return costs.

Currently, businesses lack absolute proof of the state of goods *upon bagging* and the physical integrity of the seal *upon delivery*.

---

# 💡 The ChainGuard Solution

An interconnected, Zero-Trust software pipeline.

1. **AI Omni-Scanners (Warehouse Level):** 
   High-speed computer vision automatically audits every single item's condition, expiry date, and SKU before it enters the delivery bag.
2. **Cryptographic Sealing (Hand-off Level):** 
   A tamper-evident physical bag is paired with an HMAC-SHA256 one-time QR token.
3. **Live Sync (Customer Level):** 
   Consumers watch their items get packed in real-time and verify the final delivery via cryptographic scan, instantly releasing liability.

---

# 🏗️ System Architecture

ChainGuard relies on a resilient microservice layout:

- **Frontend HUD:** A robust React/Vite Glassmorphism dashboard acting as the Customer App, Packer Tablet, and Live Analytics board.
- **Node.js Core Backend:** Managing WebSockets (Socket.io) for real-time tracking updates across all active viewports.
- **Python AI Vision Service:** Connecting directly to warehouse camera feeds, applying YOLOv8 object detection, EasyOCR for expiry reading, and OpenCV for product damage analysis.

---

# 📈 Business Value

- **Cost Reduction:** Eliminates 90% of false "Item Missing" claims by providing irrefutable photographic evidence at the packing station.
- **Zero-Hardware Pilot:** The system runs out of the box in `DEMO_MODE`, meaning enterprises can pilot the software flow instantly without purchasing expensive GPU-powered cameras.
- **Scalable Confidence:** High-frequency, stateless microservices allow the scanning layer and the web layer to scale completely independently.

---

# 🚀 Next Steps

ChainGuard is currently fully deployable via Docker. 
Check out the repository, run `docker compose up --build`, and witness the end-to-end future of supply chain transparency.
