const db = require('../database/db');
const { DateTime } = require('luxon');

/**
 * Log an activity to the audit trail
 * @param {Object} options - Audit log options
 * @param {number} options.staffId - ID of the staff member performing the action
 * @param {string} options.staffName - Name of the staff member
 * @param {string} options.staffUsername - Username of the staff member
 * @param {string} options.action - Action performed (e.g., 'CREATE_REQUEST', 'UPDATE_CLIENT', 'DELETE_STAFF')
 * @param {string} options.entityType - Type of entity affected (e.g., 'request', 'client', 'staff')
 * @param {number} options.entityId - ID of the entity affected
 * @param {string|Object} options.details - Additional details about the action (will be JSON stringified if object)
 * @param {string} options.ipAddress - IP address of the requester
 * @param {string} options.userAgent - User agent of the requester
 */
async function logActivity({
  staffId,
  staffName,
  staffUsername,
  action,
  entityType = null,
  entityId = null,
  details = null,
  ipAddress = null,
  userAgent = null
}) {
  try {
    // Convert details to JSON string if it's an object
    let detailsString = details;
    if (details && typeof details === 'object') {
      detailsString = JSON.stringify(details);
    }

    // Get current time in Nairobi timezone and convert to MySQL format
    const nairobiTime = DateTime.now().setZone('Africa/Nairobi');
    const timestamp = nairobiTime.toFormat('yyyy-MM-dd HH:mm:ss');

    // Debug logging (can be removed in production)
    if (process.env.NODE_ENV !== 'production') {
      console.log('Logging audit activity:', {
        action,
        staffId,
        staffUsername,
        ipAddress,
        entityType,
        entityId,
        timestamp: timestamp,
        timezone: 'Africa/Nairobi'
      });
    }

    // Set timezone for this session and insert with explicit Nairobi timestamp
    await db.query("SET time_zone = '+03:00'");
    await db.query(
      `INSERT INTO audit_logs (
        staff_id, staff_name, staff_username, action, 
        entity_type, entity_id, details, ip_address, user_agent, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        staffId || null,
        staffName || null,
        staffUsername || null,
        action,
        entityType,
        entityId,
        detailsString,
        ipAddress || null,
        userAgent || null,
        timestamp
      ]
    );
  } catch (error) {
    // Log error but don't throw - audit logging should not break the main flow
    console.error('Error logging audit activity:', error);
  }
}

/**
 * Get audit logs with optional filters
 * @param {Object} filters - Filter options
 * @param {number} filters.staffId - Filter by staff ID
 * @param {string} filters.action - Filter by action
 * @param {string} filters.entityType - Filter by entity type
 * @param {Date} filters.startDate - Start date for filtering
 * @param {Date} filters.endDate - End date for filtering
 * @param {number} filters.limit - Limit number of results
 * @param {number} filters.offset - Offset for pagination
 */
async function getAuditLogs(filters = {}) {
  try {
    let query = `
      SELECT 
        id, staff_id, staff_name, staff_username, action,
        entity_type, entity_id, details, ip_address, user_agent, created_at
      FROM audit_logs
      WHERE 1=1
    `;
    const params = [];

    if (filters.staffId) {
      query += ' AND staff_id = ?';
      params.push(filters.staffId);
    }

    if (filters.action) {
      query += ' AND action = ?';
      params.push(filters.action);
    }

    if (filters.entityType) {
      query += ' AND entity_type = ?';
      params.push(filters.entityType);
    }

    if (filters.startDate) {
      // Convert start date to Nairobi timezone if it's a string
      let startDate = filters.startDate;
      if (typeof startDate === 'string') {
        const dt = DateTime.fromISO(startDate, { zone: 'Africa/Nairobi' });
        startDate = dt.toSQL({ includeOffset: false });
      }
      query += ' AND created_at >= ?';
      params.push(startDate);
    }

    if (filters.endDate) {
      // Convert end date to Nairobi timezone if it's a string
      let endDate = filters.endDate;
      if (typeof endDate === 'string') {
        const dt = DateTime.fromISO(endDate, { zone: 'Africa/Nairobi' });
        endDate = dt.toSQL({ includeOffset: false });
      }
      query += ' AND created_at <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY id DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    if (filters.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }

    const [logs] = await db.query(query, params);
    return logs;
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    throw error;
  }
}

/**
 * Get audit log count with filters
 */
async function getAuditLogCount(filters = {}) {
  try {
    let query = 'SELECT COUNT(*) as count FROM audit_logs WHERE 1=1';
    const params = [];

    if (filters.staffId) {
      query += ' AND staff_id = ?';
      params.push(filters.staffId);
    }

    if (filters.action) {
      query += ' AND action = ?';
      params.push(filters.action);
    }

    if (filters.entityType) {
      query += ' AND entity_type = ?';
      params.push(filters.entityType);
    }

    if (filters.startDate) {
      // Convert start date to Nairobi timezone if it's a string
      let startDate = filters.startDate;
      if (typeof startDate === 'string') {
        const dt = DateTime.fromISO(startDate, { zone: 'Africa/Nairobi' });
        startDate = dt.toSQL({ includeOffset: false });
      }
      query += ' AND created_at >= ?';
      params.push(startDate);
    }

    if (filters.endDate) {
      // Convert end date to Nairobi timezone if it's a string
      let endDate = filters.endDate;
      if (typeof endDate === 'string') {
        const dt = DateTime.fromISO(endDate, { zone: 'Africa/Nairobi' });
        endDate = dt.toSQL({ includeOffset: false });
      }
      query += ' AND created_at <= ?';
      params.push(endDate);
    }

    const [result] = await db.query(query, params);
    return result[0].count;
  } catch (error) {
    console.error('Error counting audit logs:', error);
    throw error;
  }
}

module.exports = {
  logActivity,
  getAuditLogs,
  getAuditLogCount
};

