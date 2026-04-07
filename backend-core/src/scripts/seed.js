/**
 * scripts/seed.js
 *
 * Seeds the database with demo products and a sample order.
 * Run with: node src/scripts/seed.js
 *
 * This is safe to run multiple times — it upserts products
 * and only creates an order if none exist.
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const mongoose = require("mongoose");
const Product = require("../models/Product");
const Order = require("../models/Order");

const DEMO_STREAM_BASE = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"; // public HLS test stream

const PRODUCTS = [
  {
    productId: "PROD_DAL_001",
    name: "Toor Dal 500g",
    category: "grocery",
    expectedYoloClass: "bottle",
    warehouseZone: { zoneId: "ZONE_A1", streamUrl: DEMO_STREAM_BASE },
    pricePaise: 8500,
  },
  {
    productId: "PROD_RICE_001",
    name: "Basmati Rice 1kg",
    category: "grocery",
    expectedYoloClass: "bottle",
    warehouseZone: { zoneId: "ZONE_A1", streamUrl: DEMO_STREAM_BASE },
    pricePaise: 15000,
  },
  {
    productId: "PROD_OIL_001",
    name: "Sunflower Oil 1L",
    category: "grocery",
    expectedYoloClass: "bottle",
    warehouseZone: { zoneId: "ZONE_A2", streamUrl: DEMO_STREAM_BASE },
    pricePaise: 18000,
  },
  {
    productId: "PROD_BISCUIT_001",
    name: "Parle-G Biscuits 400g",
    category: "grocery",
    expectedYoloClass: "cake",
    warehouseZone: { zoneId: "ZONE_A2", streamUrl: DEMO_STREAM_BASE },
    pricePaise: 4500,
  },
  {
    productId: "PROD_CHIPS_001",
    name: "Lays Classic Chips 90g",
    category: "grocery",
    expectedYoloClass: "cake",
    warehouseZone: { zoneId: "ZONE_B1", streamUrl: DEMO_STREAM_BASE },
    pricePaise: 3500,
  },
  {
    productId: "PROD_MILK_001",
    name: "Amul Full Cream Milk 500ml",
    category: "food",
    expectedYoloClass: "bottle",
    warehouseZone: { zoneId: "ZONE_B1", streamUrl: DEMO_STREAM_BASE },
    pricePaise: 3200,
  },
  {
    productId: "PROD_SUGAR_001",
    name: "Sugar 1kg",
    category: "grocery",
    expectedYoloClass: "bottle",
    warehouseZone: { zoneId: "ZONE_B2", streamUrl: DEMO_STREAM_BASE },
    pricePaise: 5000,
  },
  {
    productId: "PROD_MASALA_001",
    name: "MDH Garam Masala 100g",
    category: "grocery",
    expectedYoloClass: "bottle",
    warehouseZone: { zoneId: "ZONE_B2", streamUrl: DEMO_STREAM_BASE },
    pricePaise: 9900,
  },
  {
    productId: "PROD_TEA_001",
    name: "Tata Tea Premium 250g",
    category: "grocery",
    expectedYoloClass: "bottle",
    warehouseZone: { zoneId: "ZONE_C1", streamUrl: DEMO_STREAM_BASE },
    pricePaise: 14000,
  },
  {
    productId: "PROD_SOAP_001",
    name: "Dettol Soap 3-pack",
    category: "non-grocery",
    expectedYoloClass: "cake",
    warehouseZone: { zoneId: "ZONE_C1", streamUrl: DEMO_STREAM_BASE },
    pricePaise: 12500,
  },
];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log("✅  Connected to MongoDB");

  // Upsert all products
  let upserted = 0;
  for (const p of PRODUCTS) {
    await Product.findOneAndUpdate({ productId: p.productId }, p, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
    upserted++;
  }
  console.log(`✅  Upserted ${upserted} products`);

  // Create a demo order if none exist
  const orderCount = await Order.countDocuments();
  if (orderCount === 0) {
    const demoItems = [
      { productId: "PROD_DAL_001", quantity: 2 },
      { productId: "PROD_OIL_001", quantity: 1 },
      { productId: "PROD_CHIPS_001", quantity: 3 },
      { productId: "PROD_SOAP_001", quantity: 1 },
    ];

    // Build the order manually (mirrors the orders route logic)
    const productIds = demoItems.map((i) => i.productId);
    const products = await Product.find({ productId: { $in: productIds }, isActive: true });
    const productMap = Object.fromEntries(products.map((p) => [p.productId, p]));

    const orderItems = demoItems.map((item) => {
      const product = productMap[item.productId];
      return {
        productId: item.productId,
        name: product.name,
        quantity: item.quantity,
        zoneCamera: {
          zoneId: product.warehouseZone.zoneId,
          streamUrl: product.warehouseZone.streamUrl,
        },
      };
    });

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
      customerId: "demo_customer_001",
      items: orderItems,
      zoneQueue,
      currentZoneIndex: 0,
      status: "placed",
    });

    console.log(`✅  Demo order created: ${order._id}`);
    console.log(`   Customer ID: demo_customer_001`);
    console.log(`   Items: ${orderItems.map((i) => i.name).join(", ")}`);
    console.log(`   Zones: ${zoneQueue.map((z) => z.zoneId).join(" → ")}`);
  } else {
    console.log(`ℹ️   ${orderCount} order(s) already exist — skipping demo order creation`);
  }

  await mongoose.disconnect();
  console.log("✅  Seed complete");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌  Seed failed:", err);
  process.exit(1);
});
