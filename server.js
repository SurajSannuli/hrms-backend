require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { getDashboardData , postEmployeeData } = require('./db/queries');

const app = express();

// Security Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000'
}));
app.use(express.json({ limit: '10kb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api', limiter);

// PostgreSQL connection with connection pooling
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  max: 20, // max number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error acquiring client', err.stack);
  }
  console.log('Connected to PostgreSQL database');
  release();
});

// Initialize database tables
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR(100) NOT NULL,
        name VARCHAR(100) NOT NULL,
        mail VARCHAR(100) NOT NULL,
        department VARCHAR(100) NOT NULL,
        designation VARCHAR(100) NOT NULL,
        basic_salary DECIMAL(10, 2) NOT NULL,
        allowance DECIMAL(10, 2) NOT NULL,
        total_salary DECIMAL(10, 2) NOT NULL,
        gender VARCHAR(20) NOT NULL,
        dob DATE NOT NULL,
        joining_date DATE NOT NULL,
        ess_password TEXT NOT NULL,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS leave_requests (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR(100) NOT NULL,
        leave_type VARCHAR(20) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        leave_days INTEGER NOT NULL,
        reason TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`);

    await client.query('COMMIT');
    console.log('Database tables initialized successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Database initialization failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

app.get('/api/dashboard', async (req, res) => {
  try {
    const data = await getDashboardData();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});


app.post('/api/employees', async (req, res) => {
  try {
    const data = await postEmployeeData(req.body);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to Post Employee data' });
  }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Initialize database and start server
initializeDatabase()
  .then(() => {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

process.on('SIGTERM', () => {
  pool.end(() => {
    console.log('Pool has ended');
    process.exit(0);
  });
});