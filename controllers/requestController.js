const db = require('../database/db');
const auditService = require('../services/auditService');
const { extractUserInfo } = require('../middleware/auditMiddleware');
const { DateTime } = require('luxon');

const requestController = {
  getRequests: async (req, res) => {
    const { date, status, myStatus } = req.query;

    try {
      console.log('getRequests - Query params:', { date, status, myStatus });
      
      let query = `
        SELECT r.*, 
               u.username as userName, 
               st.name as serviceTypeName,
               b.name as branchName,
               COALESCE(c.name, r.client_name) as clientName,
               r.pickup_location as pickupLocation,
               r.delivery_location as deliveryLocation
        FROM requests r
        LEFT JOIN users u ON r.user_id = u.id
        LEFT JOIN service_types st ON r.service_type_id = st.id
        LEFT JOIN branches b ON r.branch_id = b.id
        LEFT JOIN clients c ON b.client_id = c.id
      `;
      
      const conditions = [];
      const params = [];
      
      if (date) {
        // Ensure date is in YYYY-MM-DD format
        const dateStr = date.split('T')[0]; // Remove time if present
        console.log('Filtering by date:', dateStr);
        // Use DATE_FORMAT to match exactly with how dates are stored/formatted
        conditions.push('DATE_FORMAT(r.pickup_date, \'%Y-%m-%d\') = ?');
        params.push(dateStr);
      }
      
      if (status) {
        conditions.push('r.status = ?');
        params.push(status);
      }
      
      if (myStatus !== undefined) {
        conditions.push('r.my_status = ?');
        params.push(myStatus);
      }
      
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      query += ' ORDER BY r.pickup_date ASC';
      
      console.log('Executing query:', query);
      console.log('With params:', params);
      
      const [requests] = await db.query(query, params);
      console.log(`Found ${requests.length} requests`);
      res.json(requests);
    } catch (error) {
      console.error('Error fetching requests:', error);
      res.status(500).json({ message: 'Error fetching requests', error: error.message });
    }
  },

  createRequest: async (req, res) => {
    const {
      user_id,
      user_name,
      service_type_id,
      branch_id,
      pickup_location,
      delivery_location,
      pickup_date,
      description,
      price,
      priority,
      latitude,
      longitude
    } = req.body;

    try {
      // Convert pickup_date to Nairobi timezone
      let nairobiPickupDate = pickup_date;
      try {
        // Parse the incoming date (could be in various formats)
        let dt = DateTime.fromISO(pickup_date, { zone: 'Africa/Nairobi' });
        
        // If ISO parsing fails, try SQL format
        if (!dt.isValid) {
          dt = DateTime.fromSQL(pickup_date, { zone: 'Africa/Nairobi' });
        }
        
        // If still invalid, try as local time and convert to Nairobi
        if (!dt.isValid) {
          dt = DateTime.fromISO(pickup_date);
          if (dt.isValid) {
            dt = dt.setZone('Africa/Nairobi');
          }
        }
        
        if (dt.isValid) {
          nairobiPickupDate = dt.setZone('Africa/Nairobi').toSQL({ includeOffset: false });
        } else {
          console.warn('Could not parse pickup_date, using original:', pickup_date);
        }
      } catch (error) {
        console.error('Error converting pickup_date to Nairobi timezone:', error);
        // Use original if conversion fails
      }

      const [result] = await db.query(
        `INSERT INTO requests (
          user_id, user_name, service_type_id, branch_id,
          pickup_location, delivery_location, pickup_date,
          description, price, priority, latitude, longitude
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user_id, user_name, service_type_id, branch_id,
          pickup_location, delivery_location, nairobiPickupDate,
          description, price, priority, latitude, longitude
        ]
      );

      const [newRequest] = await db.query(
        `SELECT r.*, 
                u.username as user_name, 
                st.name as service_type_name,
                b.name as branch_name,
                c.name as client_name
         FROM requests r
         LEFT JOIN users u ON r.user_id = u.id
         LEFT JOIN service_types st ON r.service_type_id = st.id
         LEFT JOIN branches b ON r.branch_id = b.id
         LEFT JOIN clients c ON b.client_id = c.id
         WHERE r.id = ?`,
        [result.insertId]
      );

      // Get service type and branch names for audit log
      const serviceTypeName = newRequest[0]?.service_type_name || null;
      const branchName = newRequest[0]?.branch_name || (branch_id === 0 ? newRequest[0]?.client_name : null);

      // Log audit trail
      const userInfo = extractUserInfo(req);
      await auditService.logActivity({
        staffId: user_id || userInfo.staffId,
        staffName: user_name || userInfo.staffName,
        staffUsername: user_name || userInfo.staffUsername,
        action: 'CREATE_REQUEST',
        entityType: 'request',
        entityId: result.insertId,
        details: {
          serviceTypeId: service_type_id,
          serviceTypeName,
          branchId: branch_id,
          branchName,
          pickupLocation: pickup_location,
          deliveryLocation: delivery_location,
          price: price
        },
        ipAddress: userInfo.ipAddress,
        userAgent: userInfo.userAgent
      });

      res.status(201).json(newRequest[0]);
    } catch (error) {
      console.error('Error creating request:', error);
      res.status(500).json({ message: 'Error creating request', error: error.message });
    }
  },

  updateRequest: async (req, res) => {
    const { id } = req.params;
    const {
      service_type_id,
      branch_id,
      pickup_location,
      delivery_location,
      pickup_date,
      description,
      price,
      priority,
      status,
      latitude,
      longitude,
      staff_id
    } = req.body;

    try {
      // Convert pickup_date to Nairobi timezone if provided
      let nairobiPickupDate = pickup_date;
      if (pickup_date) {
        try {
          let dt = DateTime.fromISO(pickup_date, { zone: 'Africa/Nairobi' });
          if (!dt.isValid) {
            dt = DateTime.fromSQL(pickup_date, { zone: 'Africa/Nairobi' });
          }
          if (!dt.isValid) {
            dt = DateTime.fromISO(pickup_date);
            if (dt.isValid) {
              dt = dt.setZone('Africa/Nairobi');
            }
          }
          if (dt.isValid) {
            nairobiPickupDate = dt.setZone('Africa/Nairobi').toSQL({ includeOffset: false });
          }
        } catch (error) {
          console.error('Error converting pickup_date to Nairobi timezone:', error);
        }
      }

      await db.query(
        `UPDATE requests 
         SET service_type_id = ?,
             branch_id = ?,
             pickup_location = ?,
             delivery_location = ?,
             pickup_date = ?,
             description = ?,
             price = ?,
             priority = ?,
             status = ?,
             latitude = ?,
             longitude = ?,
             staff_id = COALESCE(?, staff_id)
         WHERE id = ?`,
        [
          service_type_id,
          branch_id,
          pickup_location,
          delivery_location,
          nairobiPickupDate,
          description,
          price,
          priority,
          status,
          latitude,
          longitude,
          staff_id || null,
          id
        ]
      );

      const [updatedRequest] = await db.query(
        `SELECT r.*, 
                u.username as user_name, 
                st.name as service_type_name,
                b.name as branch_name,
                c.name as client_name
         FROM requests r
         LEFT JOIN users u ON r.user_id = u.id
         LEFT JOIN service_types st ON r.service_type_id = st.id
         LEFT JOIN branches b ON r.branch_id = b.id
         LEFT JOIN clients c ON b.client_id = c.id
         WHERE r.id = ?`,
        [id]
      );

      if (updatedRequest.length === 0) {
        return res.status(404).json({ message: 'Request not found' });
      }

      // Get service type and branch names for audit log
      const serviceTypeName = updatedRequest[0]?.service_type_name || null;
      const branchName = updatedRequest[0]?.branch_name || (branch_id === 0 ? updatedRequest[0]?.client_name : null);

      // Log audit trail
      const userInfo = extractUserInfo(req);
      await auditService.logActivity({
        staffId: userInfo.staffId,
        staffName: userInfo.staffName,
        staffUsername: userInfo.staffUsername,
        action: 'UPDATE_REQUEST',
        entityType: 'request',
        entityId: parseInt(id),
        details: {
          serviceTypeId: service_type_id,
          serviceTypeName,
          branchId: branch_id,
          branchName,
          status: status,
          priority: priority
        },
        ipAddress: userInfo.ipAddress,
        userAgent: userInfo.userAgent
      });

      res.json(updatedRequest[0]);
    } catch (error) {
      console.error('Error updating request:', error);
      res.status(500).json({ message: 'Error updating request', error: error.message });
    }
  },

  deleteRequest: async (req, res) => {
    const { id } = req.params;

    try {
      // Get request details before deletion for audit
      const [request] = await db.query('SELECT * FROM requests WHERE id = ?', [id]);
      
      const [result] = await db.query('DELETE FROM requests WHERE id = ?', [id]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Request not found' });
      }

      // Log audit trail
      const userInfo = extractUserInfo(req);
      await auditService.logActivity({
        staffId: userInfo.staffId,
        staffName: userInfo.staffName,
        staffUsername: userInfo.staffUsername,
        action: 'DELETE_REQUEST',
        entityType: 'request',
        entityId: parseInt(id),
        details: request.length > 0 ? {
          pickupLocation: request[0].pickup_location,
          deliveryLocation: request[0].delivery_location
        } : null,
        ipAddress: userInfo.ipAddress,
        userAgent: userInfo.userAgent
      });

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting request:', error);
      res.status(500).json({ message: 'Error deleting request', error: error.message });
    }
  },

  updateStatus: async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    try {
      await db.query(
        'UPDATE requests SET status = ? WHERE id = ?',
        [status, id]
      );

      const [updatedRequest] = await db.query(
        `SELECT r.*, 
                u.username as user_name, 
                st.name as service_type_name,
                b.name as branch_name,
                c.name as client_name
         FROM requests r
         LEFT JOIN users u ON r.user_id = u.id
         LEFT JOIN service_types st ON r.service_type_id = st.id
         LEFT JOIN branches b ON r.branch_id = b.id
         LEFT JOIN clients c ON b.client_id = c.id
         WHERE r.id = ?`,
        [id]
      );

      if (updatedRequest.length === 0) {
        return res.status(404).json({ message: 'Request not found' });
      }

      // Log audit trail
      const userInfo = extractUserInfo(req);
      await auditService.logActivity({
        staffId: userInfo.staffId,
        staffName: userInfo.staffName,
        staffUsername: userInfo.staffUsername,
        action: 'UPDATE_REQUEST_STATUS',
        entityType: 'request',
        entityId: parseInt(id),
        details: { status },
        ipAddress: userInfo.ipAddress,
        userAgent: userInfo.userAgent
      });

      res.json(updatedRequest[0]);
    } catch (error) {
      console.error('Error updating request status:', error);
      res.status(500).json({ message: 'Error updating request status', error: error.message });
    }
  },

  getDoneRequestDates: async (req, res) => {
    const { year, month } = req.query;

    try {
      let query = `
        SELECT 
          DATE_FORMAT(r.pickup_date, '%Y-%m-%d') as date,
          COUNT(*) as totalRequests,
          SUM(r.price) as totalAmount
        FROM requests r
        WHERE r.my_status = 3 AND r.pickup_date IS NOT NULL
      `;
      const params = [];

      if (year) {
        query += ' AND YEAR(r.pickup_date) = ?';
        params.push(year);
      }

      if (month) {
        query += ' AND MONTH(r.pickup_date) = ?';
        params.push(month);
      }

      query += `
        GROUP BY DATE_FORMAT(r.pickup_date, '%Y-%m-%d')
        ORDER BY date DESC
      `;

      console.log('getDoneRequestDates - Query:', query);
      console.log('getDoneRequestDates - Parameters:', params);

      const [summaries] = await db.query(query, params);
      console.log(`getDoneRequestDates - Found ${summaries.length} unique dates`);

      // Ensure dates are returned as strings
      const formattedSummaries = summaries.map(summary => ({
        ...summary,
        date: summary.date ? String(summary.date).split('T')[0].split(' ')[0] : summary.date
      }));

      console.log('getDoneRequestDates - First summary date:', formattedSummaries[0]?.date);
      res.json(formattedSummaries);
    } catch (error) {
      console.error('Error fetching done request dates:', error);
      res.status(500).json({ message: 'Error fetching done request dates', error: error.message });
    }
  }
};

module.exports = requestController; 