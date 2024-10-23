const express = require('express');
const mysql = require('mysql2');
require('dotenv').config();

const app = express();

// MySQL connection pool setup
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD);
console.log('DB_NAME:', process.env.DB_NAME);
// Home route
app.get('/', (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) {
      return res.status(500).json({ message: 'Database connection failed', error: err });
    }
 // Fetch all users
    const query = 'SELECT * FROM users';
    connection.query(query, (error, results) => {
      // Release the connection back to the pool
      connection.release();

      if (error) {
        return res.status(500).json({ message: 'Error fetching users from db', error });
      }
      // Success message
      const successMessage = `Successfully connected to the database "${process.env.DB_NAME}" with user "${process.env.DB_USER}".`;
      res.status(200).json({ message: successMessage, users: results });
    });
  });
});

// Start the server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
