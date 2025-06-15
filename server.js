require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");
const {
  getDashboardData,
  postEmployeeData,
  handleLogin,
  handleApplyLeave,
  getEmployees,
  getPendingLeave,
  getAllLeaves,
  approveLeave,
  rejectLeave,
  getEmployee,
  updateEmployeeData,
  getPayroll,
  getEssDashboard,
  getEmployeeLeaves,
  adminAuth,
} = require("./db/queries");

const app = express();

// Security Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
  })
);
app.use(express.json({ limit: "10kb" }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 100 requests per windowMs
});
app.use("/api", limiter);

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
    return console.error("Error acquiring client", err.stack);
  }
  console.log("Connected to PostgreSQL database");
  release();
});

// Initialize database tables
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

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
      CREATE TABLE IF NOT EXISTS leaves (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR(100) NOT NULL,
        employee_name VARCHAR(100) NOT NULL,
        leave_type VARCHAR(20) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        reason TEXT,
        leave_days INTEGER NOT NULL,
        leave_status VARCHAR(20) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_auth (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL
      );
    `);

    await client.query("COMMIT");
    console.log("Database tables initialized successfully");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Database initialization failed:", err);
    throw err;
  } finally {
    client.release();
  }
}

// API Handling

app.get("/api/dashboard", async (req, res) => {
  try {
    const data = await getDashboardData();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

app.get("/api/get-employee/:employee_id", async (req, res) => {
  try {
    const data = await getEmployee(req);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch employee data" });
  }
});

app.post("/api/employees", async (req, res) => {
  try {
    const data = await postEmployeeData(req.body);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to Post Employee data" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const data = await handleLogin(req.body);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to Login Something Went Wrong" });
  }
});

app.post("/api/admin-login", async (req, res) => {
  try {
    const data = await adminAuth(req);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to Login Something Went Wrong" });
  }
});

app.post("/api/applyleave", async (req, res) => {
  try {
    const data = await handleApplyLeave(req.body);
    res.json(data);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to Apply Leave Something Went Wrong" });
  }
});

app.get("/api/leaves/pending", async (req, res) => {
  try {
    const data = await getPendingLeave();
    res.json(data);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to Get Pending Leave Something Went Wrong" });
  }
});

app.put("/api/leaves/:id/approve", async (req, res) => {
  try {
    const data = await approveLeave(req);
    res.json(data);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to Approve Leave Something Went Wrong" });
  }
});

app.put("/api/leaves/:id/reject", async (req, res) => {
  try {
    const data = await rejectLeave(req);
    res.json(data);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to Reject Leave Something Went Wrong" });
  }
});

app.get("/api/get-employees", async (req, res) => {
  try {
    const data = await getEmployees();
    res.json(data);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to Get Employees Something Went Wrong" });
  }
});

app.put("/api/update-employee/:employee_id", async (req, res) => {
  try {
    const data = await updateEmployeeData(req);
    res.json(data);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to Update Employee Data Something Went Wrong" });
  }
});

app.get("/api/get-leaves", async (req, res) => {
  try {
    const data = await getAllLeaves();
    res.json(data);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to Get Leaves Data Something Went Wrong" });
  }
});

app.get("/api/payroll", async (req, res) => {
  try {
    const data = await getPayroll(req);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to Payroll dashboard data" });
  }
});

app.get("/api/ess-dashboard/:employee_id", async (req, res) => {
  try {
    const data = await getEssDashboard(req);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch Ess Dashboard data" });
  }
});

app.get("/api/get-ess-leave/:employee_id", async (req, res) => {
  try {
    const data = await getEmployeeLeaves(req);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to get Ess leave data" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// Initialize database and start server
initializeDatabase()
  .then(() => {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });

process.on("SIGTERM", () => {
  pool.end(() => {
    console.log("Pool has ended");
    process.exit(0);
  });
});
