const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bm_admin_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+03:00' // Nairobi timezone (EAT - East Africa Time)
});

// Test database connection and set timezone
pool.getConnection((err, connection) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    return;
  }
  console.log('Successfully connected to MySQL database');
  
  // Set timezone to Nairobi (EAT - East Africa Time, UTC+3)
  connection.query("SET time_zone = '+03:00'", (timezoneErr) => {
    if (timezoneErr) {
      console.warn('Warning: Could not set database timezone:', timezoneErr.message);
    } else {
      console.log('Database timezone set to Africa/Nairobi (UTC+3)');
    }
    connection.release();
  });
});

// Set timezone for all new connections
pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+03:00'", (err) => {
    if (err) {
      console.warn('Warning: Could not set timezone for new connection:', err.message);
    }
  });
});

module.exports = pool.promise(); 