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

module.exports = { getDashboardData, postEmployeeData };