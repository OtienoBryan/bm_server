const auditService = require('../services/auditService');
const { DateTime } = require('luxon');

const auditController = {
  // Get all audit logs with optional filters
  getAuditLogs: async (req, res) => {
    try {
      const {
        staffId,
        action,
        entityType,
        startDate,
        endDate,
        limit = 100,
        offset = 0
      } = req.query;

      const filters = {
        staffId: staffId ? parseInt(staffId) : null,
        action: action || null,
        entityType: entityType || null,
        startDate: startDate || null,
        endDate: endDate || null,
        limit: parseInt(limit),
        offset: parseInt(offset)
      };

      // Remove null filters
      Object.keys(filters).forEach(key => {
        if (filters[key] === null) {
          delete filters[key];
        }
      });

      const logs = await auditService.getAuditLogs(filters);
      const total = await auditService.getAuditLogCount(filters);

      // Parse JSON details if present and format dates in Nairobi timezone
      const formattedLogs = logs.map(log => {
        let formattedLog = {
          ...log,
          details: log.details ? (typeof log.details === 'string' ? JSON.parse(log.details) : log.details) : null
        };
        
        // Format created_at in Nairobi timezone
        if (log.created_at) {
          const dt = DateTime.fromSQL(log.created_at, { zone: 'Africa/Nairobi' });
          if (!dt.isValid) {
            // Try ISO format if SQL parsing fails
            const dtISO = DateTime.fromISO(log.created_at, { zone: 'Africa/Nairobi' });
            formattedLog.created_at = dtISO.isValid 
              ? dtISO.setZone('Africa/Nairobi').toISO() 
              : log.created_at;
          } else {
            formattedLog.created_at = dt.setZone('Africa/Nairobi').toISO();
          }
        }
        
        return formattedLog;
      });

      res.json({
        logs: formattedLogs,
        total,
        limit: filters.limit || 100,
        offset: filters.offset || 0
      });
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      res.status(500).json({ 
        message: 'Error fetching audit logs', 
        error: error.message 
      });
    }
  },

  // Get audit log by ID
  getAuditLog: async (req, res) => {
    try {
      const { id } = req.params;
      const db = require('../database/db');
      
      const [logs] = await db.query(
        'SELECT * FROM audit_logs WHERE id = ?',
        [id]
      );

      if (logs.length === 0) {
        return res.status(404).json({ message: 'Audit log not found' });
      }

      const log = logs[0];
      log.details = log.details ? (typeof log.details === 'string' ? JSON.parse(log.details) : log.details) : null;
      
      // Format created_at in Nairobi timezone
      if (log.created_at) {
        const dt = DateTime.fromSQL(log.created_at, { zone: 'Africa/Nairobi' });
        if (!dt.isValid) {
          const dtISO = DateTime.fromISO(log.created_at, { zone: 'Africa/Nairobi' });
          log.created_at = dtISO.isValid 
            ? dtISO.setZone('Africa/Nairobi').toISO() 
            : log.created_at;
        } else {
          log.created_at = dt.setZone('Africa/Nairobi').toISO();
        }
      }

      res.json(log);
    } catch (error) {
      console.error('Error fetching audit log:', error);
      res.status(500).json({ 
        message: 'Error fetching audit log', 
        error: error.message 
      });
    }
  }
};

module.exports = auditController;

