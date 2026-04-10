const amqplib = require("amqplib");
const { handleOrderCreated, handleProductCreated } = require("./handlers");
async function start() {
  let retries = 15, conn;
  while (retries--) {
    try { conn = await amqplib.connect(process.env.BROKER_URL); break; }
    catch (e) {
      console.log(`[Consumer] Retrying broker... (${retries} left)`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  if (!conn) throw new Error("Cannot connect to broker");
  const ch = await conn.createChannel();
  ch.prefetch(5);
  await ch.assertQueue("order-events", { durable: true });
  await ch.assertQueue("product-events", { durable: true });
  ch.consume("order-events", async (msg) => {
    if (!msg) return;
    try { await handleOrderCreated(JSON.parse(msg.content.toString())); ch.ack(msg); }
    catch (e) { console.error("[Consumer] order event failed:", e.message); ch.nack(msg, false, false); }
  });
  ch.consume("product-events", async (msg) => {
    if (!msg) return;
    try { await handleProductCreated(JSON.parse(msg.content.toString())); ch.ack(msg); }
    catch (e) { console.error("[Consumer] product event failed:", e.message); ch.nack(msg, false, false); }
  });
  console.log("[Consumer] Listening for events...");
}
start().catch(e => { console.error(e); process.exit(1); });
