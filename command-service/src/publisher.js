const amqplib = require("amqplib");
const pool = require("./db");
let channel = null;
async function connectBroker() {
  let retries = 10;
  while (retries--) {
    try {
      const conn = await amqplib.connect(process.env.BROKER_URL);
      channel = await conn.createChannel();
      console.log("[Publisher] Connected to broker");
      return;
    } catch (e) {
      console.log(`[Publisher] Retrying... (${retries} left)`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error("Cannot connect to broker");
}
async function pollAndPublish() {
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        "SELECT * FROM outbox WHERE published_at IS NULL ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED"
      );
      for (const row of rows) {
        if (!channel) continue;
        channel.assertQueue(row.topic, { durable: true });
        channel.sendToQueue(row.topic, Buffer.from(JSON.stringify(row.payload)), { persistent: true });
        await client.query("UPDATE outbox SET published_at = NOW() WHERE id = $1", [row.id]);
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      console.error("[Publisher] Error:", e.message);
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[Publisher] DB error:", e.message);
  }
}
async function startPublisher() {
  await connectBroker();
  setInterval(pollAndPublish, 1000);
}
module.exports = { startPublisher };
