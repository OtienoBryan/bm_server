-- Create audit_logs table
-- Note: MySQL TIMESTAMP stores in UTC, but we'll handle timezone conversion in application code
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  staff_id INT,
  staff_name VARCHAR(255),
  staff_username VARCHAR(255),
  action VARCHAR(255) NOT NULL,
  entity_type VARCHAR(100),
  entity_id INT,
  details TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_staff_id (staff_id),
  INDEX idx_action (action),
  INDEX idx_entity_type (entity_type),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Set timezone for MySQL session (optional, but helps with default timestamps)
-- This should be set in your MySQL connection or application startup
-- SET time_zone = '+03:00'; -- East Africa Time (Nairobi)

