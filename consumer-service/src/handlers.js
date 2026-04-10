const pool = require("./db");
async function isProcessed(client, eventId) {
  const { rows } = await client.query("SELECT 1 FROM processed_events WHERE event_id=$1", [eventId]);
  return rows.length > 0;
}
async function markProcessed(client, eventId) {
  await client.query("INSERT INTO processed_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING", [eventId]);
  await client.query("UPDATE sync_status SET last_processed_event_timestamp=NOW(), updated_at=NOW() WHERE id=1");
}
async function handleOrderCreated(payload) {
  const eventId = `order-${payload.orderId}-${payload.timestamp}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (await isProcessed(client, eventId)) { await client.query("ROLLBACK"); return; }
    const hourTs = new Date(payload.timestamp);
    hourTs.setMinutes(0, 0, 0);
    for (const item of payload.items) {
      await client.query(`
        INSERT INTO product_sales_view (product_id,product_name,category,total_quantity_sold,total_revenue,order_count)
        VALUES ($1,$2,$3,$4,$5,1)
        ON CONFLICT (product_id) DO UPDATE SET
          product_name=EXCLUDED.product_name,
          category=EXCLUDED.category,
          total_quantity_sold=product_sales_view.total_quantity_sold+EXCLUDED.total_quantity_sold,
          total_revenue=product_sales_view.total_revenue+EXCLUDED.total_revenue,
          order_count=product_sales_view.order_count+1,
          updated_at=NOW()
      `, [item.productId, item.productName||"", item.category||"", item.quantity, item.price*item.quantity]);
      await client.query(`
        INSERT INTO category_metrics_view (category_name,total_revenue,total_orders)
        VALUES ($1,$2,1)
        ON CONFLICT (category_name) DO UPDATE SET
          total_revenue=category_metrics_view.total_revenue+EXCLUDED.total_revenue,
          total_orders=category_metrics_view.total_orders+1,
          updated_at=NOW()
      `, [item.category||"unknown", item.price*item.quantity]);
    }
    await client.query(`
      INSERT INTO customer_ltv_view (customer_id,total_spent,order_count,last_order_date)
      VALUES ($1,$2,1,$3)
      ON CONFLICT (customer_id) DO UPDATE SET
        total_spent=customer_ltv_view.total_spent+EXCLUDED.total_spent,
        order_count=customer_ltv_view.order_count+1,
        last_order_date=EXCLUDED.last_order_date,
        updated_at=NOW()
    `, [payload.customerId, payload.total, payload.timestamp]);
    await client.query(`
      INSERT INTO hourly_sales_view (hour_timestamp,total_orders,total_revenue)
      VALUES ($1,1,$2)
      ON CONFLICT (hour_timestamp) DO UPDATE SET
        total_orders=hourly_sales_view.total_orders+1,
        total_revenue=hourly_sales_view.total_revenue+EXCLUDED.total_revenue,
        updated_at=NOW()
    `, [hourTs.toISOString(), payload.total]);
    await markProcessed(client, eventId);
    await client.query("COMMIT");
    console.log(`[Consumer] OrderCreated orderId=${payload.orderId}`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[Consumer] Error:", e.message);
    throw e;
  } finally {
    client.release();
  }
}
async function handleProductCreated(payload) {
  const eventId = `product-${payload.productId}-${payload.timestamp}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (await isProcessed(client, eventId)) { await client.query("ROLLBACK"); return; }
    await client.query(`
      INSERT INTO product_sales_view (product_id,product_name,category,total_quantity_sold,total_revenue,order_count)
      VALUES ($1,$2,$3,0,0,0)
      ON CONFLICT (product_id) DO UPDATE SET
        product_name=EXCLUDED.product_name, category=EXCLUDED.category, updated_at=NOW()
    `, [payload.productId, payload.name, payload.category]);
    await markProcessed(client, eventId);
    await client.query("COMMIT");
    console.log(`[Consumer] ProductCreated productId=${payload.productId}`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
module.exports = { handleOrderCreated, handleProductCreated };
