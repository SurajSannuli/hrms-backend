require('dotenv').config();
const { Pool } = require('pg');

// Create a connection pool
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT), // ensure port is a number
});

// Gracefully close pool on shutdown
process.on('exit', () => pool.end());

// ✅ Export the pool
module.exports = pool;
