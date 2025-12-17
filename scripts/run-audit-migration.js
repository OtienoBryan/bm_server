const db = require('../database/db');
const fs = require('fs');
const path = require('path');

async function runAuditMigration() {
  try {
    console.log('Running audit logs table migration...');
    
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, '../migrations/create_audit_logs_table.sql'),
      'utf8'
    );

    // Execute the migration
    await db.query(migrationSQL);
    
    console.log('✓ Audit logs table created successfully');
    process.exit(0);
  } catch (error) {
    console.error('✗ Error running migration:', error);
    process.exit(1);
  }
}

runAuditMigration();

