require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

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
      CREATE TABLE IF NOT EXISTS departments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`);
      
    await client.query(`
      CREATE TABLE IF NOT EXISTS designations (
        id SERIAL PRIMARY KEY,
        department_id INTEGER REFERENCES departments(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(department_id, name)
      )`);
      
    await client.query(`
      CREATE TABLE IF NOT EXISTS leave_types (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
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

// Departments API
app.get('/api/departments', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name FROM departments ORDER BY name'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

app.post('/api/departments', 
  body('name').trim().isLength({ min: 2, max: 255 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name } = req.body;
    try {
      const { rows } = await pool.query(
        'INSERT INTO departments (name) VALUES ($1) RETURNING id, name',
        [name]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Department already exists' });
      }
      console.error(err);
      res.status(500).json({ error: 'Failed to create department' });
    }
  }
);

// Designations API
app.get('/api/designations/:departmentId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name FROM designations 
       WHERE department_id = $1 ORDER BY name`,
      [req.params.departmentId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch designations' });
  }
});

app.post('/api/designations',
  body('department_id').isInt(),
  body('name').trim().isLength({ min: 2, max: 255 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { department_id, name } = req.body;
    try {
      const { rows } = await pool.query(
        `INSERT INTO designations (department_id, name) 
         VALUES ($1, $2) RETURNING id, name`,
        [department_id, name]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23503') {
        return res.status(404).json({ error: 'Department not found' });
      }
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Designation already exists for this department' });
      }
      console.error(err);
      res.status(500).json({ error: 'Failed to create designation' });
    }
  }
);

// Leave Types API
app.get('/api/leave-types', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name FROM leave_types ORDER BY name'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch leave types' });
  }
});

app.post('/api/leave-types',
  body('name').trim().isLength({ min: 2, max: 255 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name } = req.body;
    try {
      const { rows } = await pool.query(
        'INSERT INTO leave_types (name) VALUES ($1) RETURNING id, name',
        [name]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Leave type already exists' });
      }
      console.error(err);
      res.status(500).json({ error: 'Failed to create leave type' });
    }
  }
);

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