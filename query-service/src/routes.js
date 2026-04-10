const express = require("express");
const pool = require("./db");
const router = express.Router();
router.get("/health", (req, res) => res.json({ status: "ok" }));
router.get("/api/analytics/products/:productId/sales", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT product_id,total_quantity_sold,total_revenue,order_count FROM product_sales_view WHERE product_id=$1",
    [req.params.productId]
  );
  if (!rows.length) return res.status(404).json({ error: "Product not found" });
  const r = rows[0];
  res.json({ productId: +r.product_id, totalQuantitySold: +r.total_quantity_sold, totalRevenue: +r.total_revenue, orderCount: +r.order_count });
});
router.get("/api/analytics/categories/:category/revenue", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT category_name,total_revenue,total_orders FROM category_metrics_view WHERE category_name=$1",
    [req.params.category]
  );
  if (!rows.length) return res.status(404).json({ error: "Category not found" });
  const r = rows[0];
  res.json({ category: r.category_name, totalRevenue: +r.total_revenue, totalOrders: +r.total_orders });
});
router.get("/api/analytics/customers/:customerId/lifetime-value", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT customer_id,total_spent,order_count,last_order_date FROM customer_ltv_view WHERE customer_id=$1",
    [req.params.customerId]
  );
  if (!rows.length) return res.status(404).json({ error: "Customer not found" });
  const r = rows[0];
  res.json({ customerId: +r.customer_id, totalSpent: +r.total_spent, orderCount: +r.order_count, lastOrderDate: r.last_order_date });
});
router.get("/api/analytics/sync-status", async (req, res) => {
  const { rows } = await pool.query("SELECT last_processed_event_timestamp FROM sync_status WHERE id=1");
  const ts = rows[0]?.last_processed_event_timestamp;
  res.json({
    lastProcessedEventTimestamp: ts ? ts.toISOString() : null,
    lagSeconds: ts ? Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000) : null
  });
});
module.exports = router;
