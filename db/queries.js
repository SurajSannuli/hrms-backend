const pool = require('../database');

const getDashboardData = async () => {
  const client = await pool.connect();
  try {
    // Get total employees
    const totalEmployeesRes = await client.query(
      'SELECT COUNT(*) FROM employees WHERE active = true'
    );
    
    // Get employees on leave today
    const onLeaveRes = await client.query(
      `SELECT COUNT(*) FROM leave_requests 
       WHERE $1 BETWEEN start_date AND end_date 
       AND status = 'approved'`,
      [new Date().toISOString().split('T')[0]]
    );
    
    // Get monthly payroll
    const payrollRes = await client.query(
      'SELECT SUM(salary) FROM employees WHERE active = true'
    );
    
    // Get newest employee
    const newestEmployeeRes = await client.query(
      'SELECT name, position, join_date FROM employees ORDER BY join_date DESC LIMIT 1'
    );
    
    // Get gender distribution
    const genderRes = await client.query(
      'SELECT gender, COUNT(*) FROM employees WHERE active = true GROUP BY gender'
    );
    
    return {
      totalEmployees: parseInt(totalEmployeesRes.rows[0].count),
      employeesOnLeave: parseInt(onLeaveRes.rows[0].count),
      monthlyPayroll: parseFloat(payrollRes.rows[0].sum),
      newestEmployee: {
        name: newestEmployeeRes.rows[0].name,
        position: newestEmployeeRes.rows[0].position,
        joinDate: newestEmployeeRes.rows[0].join_date
      },
      genderDistribution: genderRes.rows.map(row => ({
        name: row.gender,
        value: parseInt(row.count)
      }))
    };
  } finally {
    client.release();
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
      essPassword
    ];

    const result = await client.query(query, values);
    return result.rows[0];
  } catch (err) {
    console.error('Error inserting employee:', err);
    throw err;
  } finally {
    client.release();
  }
};

const handleLogin = async (req) => {
  
  const { identifier, password } = req

  if (!identifier || !password) {
    return { success: false, message: 'Identifier and password required' };
  }

  try {
    const query = `
      SELECT ess_password FROM employees 
      WHERE mail = $1 OR employee_id = $1
    `;
    const result = await pool.query(query, [identifier]);

    if (result.rows.length === 0) {
      return res.json({ success: false, message: 'Invalid credentials' });
    }

   if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const storedPassword = result.rows[0].ess_password;

    // Plain text comparison (no hashing)
    if (password !== storedPassword) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    return { success: true, message: "Logged In Success" }

  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  };
}

const handleApplyLeave = async (req) => {
  const { employee_id, employee_name, leaveType, start_date, end_date, reason, leave_days, leave_status } = req;
  try {
    const result = await pool.query(
      `INSERT INTO leaves 
        (employee_id, employee_name, leave_type, start_date, end_date, reason, leave_days, leave_status) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
        RETURNING *`,
      [employee_id, employee_name, leaveType, start_date, end_date, reason, leave_days, leave_status]
    );
    return { success: true, leave: result.rows[0] };
  } catch (err) {
    console.error('Error applying leave:', err);
    return { success: false, message: 'Server error' };
  };
};



const getEmployees = async() => {
  try {
    const result = await pool.query('SELECT employee_id, name FROM employees');
    return result.rows;
  } catch (error) {
    console.error('Error fetching employees:', error);
    return { status: 500 , message: 'Internal Server Error' };
  }
};




module.exports = { getDashboardData, postEmployeeData, handleLogin, handleApplyLeave, getEmployees };