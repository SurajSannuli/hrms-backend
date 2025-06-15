const pool = require("../database");

const getDashboardData = async () => {
  const client = await pool.connect();
  try {
    // Get total employees
    const totalEmployeesRes = await client.query(
      "SELECT COUNT(*) FROM employees WHERE active = true"
    );

    // Get employees on leave today
    const onLeaveRes = await client.query(
      `SELECT COUNT(*) FROM leaves 
       WHERE $1 BETWEEN start_date AND end_date 
       AND leave_status = 'APPROVED'`,
      [new Date().toISOString().split("T")[0]]
    );

    // Get monthly payroll
    const payrollRes = await client.query(
      "SELECT SUM(total_salary) FROM employees WHERE active = true"
    );

    // Get newest employee
    const newestEmployeeRes = await client.query(
      "SELECT name, designation, joining_date FROM employees ORDER BY joining_date DESC LIMIT 1"
    );

    // Get gender distribution
    const genderRes = await client.query(
      "SELECT gender, COUNT(*) FROM employees WHERE active = true GROUP BY gender"
    );

    return {
      totalEmployees: parseInt(totalEmployeesRes.rows[0].count),
      employeesOnLeave: parseInt(onLeaveRes.rows[0].count),
      monthlyPayroll: parseFloat(payrollRes.rows[0].sum),
      newestEmployee: {
        name: newestEmployeeRes.rows[0].name,
        position: newestEmployeeRes.rows[0].position,
        joinDate: newestEmployeeRes.rows[0].join_date,
      },
      genderDistribution: genderRes.rows.map((row) => ({
        name: row.gender,
        value: parseInt(row.count),
      })),
    };
  } finally {
    client.release();
  }
};

const getEssDashboard = async (req) => {
  const { employee_id } = req.params;

  const query = `
    SELECT 
      e.employee_id,
      e.name,
      e.designation,
      e.department,
      e.joining_date,
      e.total_salary,

      COALESCE(SUM(CASE WHEN l.leave_status = 'APPROVED' THEN l.leave_days ELSE 0 END), 0) AS approved_leaves,
      COALESCE(SUM(CASE WHEN l.leave_status = 'PENDING' THEN l.leave_days ELSE 0 END), 0) AS pending_leaves,
      COALESCE(SUM(CASE WHEN l.leave_status = 'REJECTED' THEN l.leave_days ELSE 0 END), 0) AS rejected_leaves

    FROM employees e
    LEFT JOIN leaves l ON l.employee_id = e.employee_id
    WHERE e.employee_id = $1
    GROUP BY 
      e.employee_id, e.name, e.designation, e.department, e.joining_date,
      e.total_salary;
  `;

  try {
    const result = await pool.query(query, [employee_id]);
    return { success: true, status: 200, data: result.rows[0] };
  } catch (err) {
    console.error("Error fetching ESS dashboard data:", err);
    return {
      success: false,
      status: 500,
      message: "Failed to fetch dashboard data for employee",
    };
  }
};

const postEmployeeData = async (employee) => {
  const {
    employeeId,
    name,
    mailId,
    department,
    designation,
    basicSalary,
    allowance,
    totalSalary,
    gender,
    dob,
    joiningDate,
    essPassword,
  } = employee;

  const client = await pool.connect();
  try {
    const query = `
      INSERT INTO employees (
        employee_id, name, mail, department, designation,
        basic_salary, allowance, total_salary, gender,
        dob, joining_date, ess_password
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12
      )
      RETURNING *`;

    const values = [
      employeeId,
      name,
      mailId,
      department,
      designation,
      basicSalary,
      allowance,
      totalSalary,
      gender,
      dob,
      joiningDate,
      essPassword,
    ];

    const result = await client.query(query, values);
    return result.rows[0];
  } catch (err) {
    console.error("Error inserting employee:", err);
    throw err;
  } finally {
    client.release();
  }
};

const handleLogin = async (req) => {
  const { identifier, password } = req;

  if (!identifier || !password) {
    return { success: false, message: "Identifier and password required" };
  }

  try {
    const query = `
      SELECT employee_id, name, ess_password FROM employees 
      WHERE mail = $1 OR employee_id = $1
    `;
    const result = await pool.query(query, [identifier]);

    if (result.rows.length === 0) {
      return { success: false, message: "Invalid credentials" };
    }

    const employee = result.rows[0];

    if (password !== employee.ess_password) {
      return { success: false, message: "Invalid credentials" };
    }

    return {
      success: true,
      message: "Logged In Success",
      employee: {
        employee_id: employee.employee_id,
        name: employee.name,
      },
    };
  } catch (err) {
    console.error(err);
    return { success: false, message: "Server error" };
  }
};

const handleApplyLeave = async (req) => {
  const {
    employee_id,
    employee_name,
    leaveType,
    start_date,
    end_date,
    reason,
    leave_days,
    leave_status,
  } = req;
  try {
    const result = await pool.query(
      `INSERT INTO leaves 
        (employee_id, employee_name, leave_type, start_date, end_date, reason, leave_days, leave_status) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
        RETURNING *`,
      [
        employee_id,
        employee_name,
        leaveType,
        start_date,
        end_date,
        reason,
        leave_days,
        leave_status,
      ]
    );
    return { success: true, leave: result.rows[0] };
  } catch (err) {
    console.error("Error applying leave:", err);
    return { success: false, message: "Server error" };
  }
};

const getPendingLeave = async () => {
  try {
    const result = await pool.query(
      "SELECT * FROM leaves WHERE leave_status = 'PENDING'"
    );
    return result.rows;
  } catch (error) {
    console.error("Error fetching employees:", error);
    return { status: 500, message: "Internal Server Error" };
  }
};

const approveLeave = async (req) => {
  const leaveId = req.params.id;
  try {
    await pool.query(
      "UPDATE leaves SET leave_status = 'APPROVED' WHERE id = $1",
      [leaveId]
    );
    return { status: 200, success: true };
  } catch (error) {
    return { status: 500, success: false, message: error };
  }
};

const rejectLeave = async (req) => {
  const leaveId = req.params.id;
  try {
    await pool.query(
      "UPDATE leaves SET leave_status = 'REJECTED' WHERE id = $1",
      [leaveId]
    );
    return { status: 200, success: true };
  } catch (error) {
    return { status: 500, success: false, message: error };
  }
};

const getEmployees = async () => {
  try {
    const result = await pool.query("SELECT * FROM employees");
    return result.rows;
  } catch (error) {
    console.error("Error fetching employees:", error);
    return { status: 500, message: "Internal Server Error" };
  }
};

const getEmployee = async (req) => {
  const employeeId = req.params.employee_id;
  try {
    const result = await pool.query(
      "SELECT * FROM employees WHERE employee_id = $1",
      [employeeId]
    );
    return result.rows;
  } catch (error) {
    console.error("Error fetching employee:", error);
    return { status: 500, message: "Internal Server Error" };
  }
};

const getEmployeeNameAndId = async () => {
  try {
    const result = await pool.query(
      "SELECT eployee_id, employee_name FROM employees"
    );
    return result.rows;
  } catch (error) {
    console.error("Error fetching employees name and employee id:", error);
    return { status: 500, message: "Internal Server Error" };
  }
};

const getAllLeaves = async () => {
  try {
    const result = await pool.query("SELECT * FROM leaves");
    return result.rows;
  } catch (error) {
    console.error("Error fetching employees:", error);
    return { status: 500, message: "Internal Server Error" };
  }
};

const getEmployeeLeaves = async (req) => {
  const { employee_id } = req.params;
  try {
    const result = await pool.query(
      "SELECT * FROM leaves WHERE employee_id = $1",
      [employee_id]
    );
    return result.rows;
  } catch (error) {
    console.error("Error fetching employees:", error);
    return { status: 500, message: "Internal Server Error" };
  }
};

const updateEmployeeData = async (req) => {
  const { employee_id } = req.params;
  const {
    name,
    gender,
    dob,
    mailId,
    department,
    designation,
    joiningDate,
    basicSalary,
    allowance,
    totalSalary,
    essPassword,
  } = req.body;

  try {
    await pool.query(
      `
      UPDATE employees SET
        name = $1, gender = $2, dob = $3, mail = $4,
        department = $5, designation = $6, joining_date = $7,
        basic_salary = $8, allowance = $9, total_salary = $10, ess_password = $11
      WHERE employee_id = $12
    `,
      [
        name,
        gender,
        dob,
        mailId,
        department,
        designation,
        joiningDate,
        basicSalary,
        allowance,
        totalSalary,
        essPassword,
        employee_id,
      ]
    );
    return {
      status: 200,
      success: true,
      message: "Employee updated successfully",
    };
  } catch (err) {
    return { status: 500, success: false, message: err };
  }
};

const getPayroll = async (req) => {
  const { month, year } = req.query;

  try {
    // Get all employees
    const empResult = await pool.query("SELECT * FROM employees");
    const employees = empResult.rows;

    // Get all unpaid leaves for selected month and year
    const leaveResult = await pool.query(
      `SELECT employee_id, SUM(leave_days) AS total_unpaid_days
       FROM leaves
       WHERE leave_type = 'Unpaid' AND EXTRACT(MONTH FROM start_date) = $1 AND EXTRACT(YEAR FROM start_date) = $2
       GROUP BY employee_id`,
      [month, year]
    );

    const leaveMap = {};
    leaveResult.rows.forEach((leave) => {
      leaveMap[leave.employee_id] = parseInt(leave.total_unpaid_days);
    });

    const daysInMonth = new Date(year, month, 0).getDate();

    const payroll = employees.map((emp) => {
      const totalSalary = Number(emp.basic_salary) + Number(emp.allowance);
      const unpaidDays = leaveMap[emp.employee_id] || 0;
      const dailyRate = totalSalary / daysInMonth;
      const unpaidDeduction = unpaidDays * dailyRate;
      const grossSalary = totalSalary;
      const netSalary =
        grossSalary - Number(emp.deductions || 0) - unpaidDeduction;

      return {
        id: emp.employee_id,
        name: emp.name,
        department: emp.department,
        designation: emp.designation,
        basicSalary: Number(emp.basic_salary),
        allowances: Number(emp.allowance),
        // deductions: Number(emp.deductions || 0),
        unpaidLeaves: unpaidDays,
        unpaidDeduction: parseFloat(unpaidDeduction.toFixed(2)),
        grossSalary: grossSalary,
        netSalary: parseFloat(netSalary.toFixed(2)),
      };
    });

    return { payroll, success: true, status: 200 };
  } catch (err) {
    console.error("Payroll fetch error:", err);
    return { message: err, success: false, status: 500 };
  }
};

const adminAuth = async (req) => {
  const { identifier, password } = req.body;
  try {
    const result = await pool.query(
      "SELECT * FROM admin_auth WHERE username = $1",
      [identifier]
    );

    if (result.rows.length === 0) {
      return { success: false, message: "User not found" };
    }

    const user = result.rows[0];
    const match = user.password === password;

    if (match) {
      return { success: true, status: 200 };
    } else {
      return { success: false, message: "Invalid password", status: 404 };
    }
  } catch (err) {
    console.error("Login error:", err);
    return { success: false, message: "Server error", status: 500 };
  }
};

module.exports = {
  getDashboardData,
  postEmployeeData,
  handleLogin,
  handleApplyLeave,
  getPendingLeave,
  approveLeave,
  rejectLeave,
  getEmployee,
  getEmployees,
  getAllLeaves,
  getEmployeeNameAndId,
  getEmployee,
  updateEmployeeData,
  getPayroll,
  getEssDashboard,
  getEmployeeLeaves,
  adminAuth,
};
