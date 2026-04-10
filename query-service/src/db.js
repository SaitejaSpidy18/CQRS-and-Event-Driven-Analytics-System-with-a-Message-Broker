const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.READ_DATABASE_URL });
module.exports = pool;
