const { Pool } = require('pg');

// Create a connection pool
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'hr_master',
  password: 'Mi*998909',
  port: 5432,
});

// Query example
async function getUsers() {
  try {
    const res = await pool.query('SELECT * FROM users');
    console.log(res.rows);
    return res.rows;
  } catch (err) {
    console.error('Error executing query', err);
    throw err;
  }
}

// Don't forget to close the pool when your app shuts down
process.on('exit', () => pool.end());