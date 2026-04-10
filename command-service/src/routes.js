const express = require("express");
const pool = require("./db");
const router = express.Router();
router.get("/health", (req, res) => res.json({ status: "ok" }));
router.post("/api/products", async (req, res) => {
  const { name, category, price, stock } = req.body;
  if (!name || !category || price == null || stock == null)
    return res.status(400).json({ error: "name, category, price, stock required" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "INSERT INTO products (name,category,price,stock) VALUES ($1,$2,$3,$4) RETURNING id",
      [name, category, price, stock]
    );
    const productId = rows[0].id;
    const event = { eventType: "ProductCreated", productId, name, category, price, stock, timestamp: new Date().toISOString() };
    await client.query("INSERT INTO outbox (topic,payload) VALUES ($1,$2)", ["product-events", JSON.stringify(event)]);
    await client.query("COMMIT");
    res.status(201).json({ productId });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});
router.post("/api/orders", async (req, res) => {
  const { customerId, items } = req.body;
  if (!customerId || !items?.length)
    return res.status(400).json({ error: "customerId and items required" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const item of items) {
      const { rows } = await client.query("SELECT stock FROM products WHERE id=$1 FOR UPDATE", [item.productId]);
      if (!rows.length) throw { status: 404, message: `Product ${item.productId} not found` };
      if (rows[0].stock < item.quantity) throw { status: 409, message: `Insufficient stock for product ${item.productId}` };
    }
    for (const item of items) {
      await client.query("UPDATE products SET stock=stock-$1 WHERE id=$2", [item.quantity, item.productId]);
    }
    const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const { rows: oRows } = await client.query(
      "INSERT INTO orders (customer_id,total,status) VALUES ($1,$2,'pending') RETURNING id",
      [customerId, total]
    );
    const orderId = oRows[0].id;
    const enrichedItems = [];
    for (const item of items) {
      await client.query(
        "INSERT INTO order_items (order_id,product_id,quantity,price) VALUES ($1,$2,$3,$4)",
        [orderId, item.productId, item.quantity, item.price]
      );
      const { rows: pRows } = await client.query("SELECT name,category FROM products WHERE id=$1", [item.productId]);
      enrichedItems.push({ ...item, productName: pRows[0].name, category: pRows[0].category });
    }
    const event = { eventType: "OrderCreated", orderId, customerId, items: enrichedItems, total, timestamp: new Date().toISOString() };
    await client.query("INSERT INTO outbox (topic,payload) VALUES ($1,$2)", ["order-events", JSON.stringify(event)]);
    await client.query("COMMIT");
    res.status(201).json({ orderId });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});
module.exports = router;
