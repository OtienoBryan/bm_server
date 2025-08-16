const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrateClients() {
  let connection;

  try {
    // Create connection to the database
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'bm_admin_db'
    });

    console.log('Connected to database');

    // Check if account_number column exists
    const [columns] = await connection.query(
      "SHOW COLUMNS FROM clients LIKE 'account_number'"
    );

    if (columns.length === 0) {
      console.log('Adding account_number column to clients table...');
      
      // Add account_number column
      await connection.query(
        'ALTER TABLE clients ADD COLUMN account_number VARCHAR(100) UNIQUE AFTER name'
      );
      
      // Update existing clients with a default account number
      const [clients] = await connection.query('SELECT id, name FROM clients');
      
      for (const client of clients) {
        const accountNumber = `ACC${client.id.toString().padStart(4, '0')}`;
        await connection.query(
          'UPDATE clients SET account_number = ? WHERE id = ?',
          [accountNumber, client.id]
        );
        console.log(`Updated client ${client.name} with account number: ${accountNumber}`);
      }
      
      console.log('Successfully added account_number column and populated existing clients');
    } else {
      console.log('account_number column already exists');
    }

    // Check if branches table exists
    const [tables] = await connection.query(
      "SHOW TABLES LIKE 'branches'"
    );

    if (tables.length === 0) {
      console.log('Creating branches table...');
      
      await connection.query(`
        CREATE TABLE IF NOT EXISTS branches (
          id INT PRIMARY KEY AUTO_INCREMENT,
          client_id INT NOT NULL,
          name VARCHAR(255) NOT NULL,
          address TEXT,
          contact_person VARCHAR(255),
          contact_number VARCHAR(50),
          email VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
        )
      `);
      
      console.log('Successfully created branches table');
    } else {
      console.log('branches table already exists');
    }

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed');
    }
  }
}

// Run the migration
migrateClients()
  .then(() => {
    console.log('Migration completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
