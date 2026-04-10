const express = require("express");
const routes = require("./routes");
const { startPublisher } = require("./publisher");
const app = express();
app.use(express.json());
app.use(routes);
const PORT = process.env.PORT || 8080;
app.listen(PORT, async () => {
  console.log(`[Command Service] Listening on port ${PORT}`);
  try { await startPublisher(); }
  catch (e) { console.error("[Command Service] Publisher error:", e.message); }
});
