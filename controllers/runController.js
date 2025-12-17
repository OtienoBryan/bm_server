const db = require('../database/db');
const { DateTime } = require('luxon');

const runController = {
  getRuns: async (req, res) => {
    const { date } = req.query;

    try {
      const [runs] = await db.query(
        `SELECT r.*, u.username as user_name, st.name as service_type_name
         FROM requests r
         LEFT JOIN users u ON r.user_id = u.id
         LEFT JOIN service_types st ON r.service_type_id = st.id
         WHERE DATE(r.pickup_date) = ?
         ORDER BY r.pickup_date ASC`,
        [date]
      );
      res.json(runs);
    } catch (error) {
      console.error('Error fetching runs:', error);
      res.status(500).json({ message: 'Error fetching runs', error: error.message });
    }
  },

  createRun: async (req, res) => {
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

      const [newRun] = await db.query(
        `SELECT r.*, u.username as user_name, st.name as service_type_name
         FROM requests r
         LEFT JOIN users u ON r.user_id = u.id
         LEFT JOIN service_types st ON r.service_type_id = st.id
         WHERE r.id = ?`,
        [result.insertId]
      );

      res.status(201).json(newRun[0]);
    } catch (error) {
      console.error('Error creating run:', error);
      res.status(500).json({ message: 'Error creating run', error: error.message });
    }
  },

  updateRun: async (req, res) => {
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
      longitude
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
             longitude = ?
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
          id
        ]
      );

      const [updatedRun] = await db.query(
        `SELECT r.*, u.username as user_name, st.name as service_type_name
         FROM requests r
         LEFT JOIN users u ON r.user_id = u.id
         LEFT JOIN service_types st ON r.service_type_id = st.id
         WHERE r.id = ?`,
        [id]
      );

      if (updatedRun.length === 0) {
        return res.status(404).json({ message: 'Run not found' });
      }

      res.json(updatedRun[0]);
    } catch (error) {
      console.error('Error updating run:', error);
      res.status(500).json({ message: 'Error updating run', error: error.message });
    }
  },

  deleteRun: async (req, res) => {
    const { id } = req.params;

    try {
      const [result] = await db.query('DELETE FROM requests WHERE id = ?', [id]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Run not found' });
      }

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting run:', error);
      res.status(500).json({ message: 'Error deleting run', error: error.message });
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

      const [updatedRun] = await db.query(
        `SELECT r.*, u.username as user_name, st.name as service_type_name
         FROM requests r
         LEFT JOIN users u ON r.user_id = u.id
         LEFT JOIN service_types st ON r.service_type_id = st.id
         WHERE r.id = ?`,
        [id]
      );

      if (updatedRun.length === 0) {
        return res.status(404).json({ message: 'Run not found' });
      }

      res.json(updatedRun[0]);
    } catch (error) {
      console.error('Error updating run status:', error);
      res.status(500).json({ message: 'Error updating run status', error: error.message });
    }
  },

  getDateSummaries: async (req, res) => {
    try {
      const { year, month, clientId, branchId } = req.query;
      let query = `
        SELECT 
          DATE_FORMAT(r.pickup_date, '%Y-%m-%d') as date,
          COUNT(*) as totalRuns,
          SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END) as totalRunsCompleted,
          SUM(r.price) as totalAmount,
          SUM(CASE WHEN r.status = 'completed' THEN r.price ELSE 0 END) as totalAmountCompleted
        FROM requests r
        LEFT JOIN branches b ON r.branch_id = b.id
        WHERE r.pickup_date IS NOT NULL
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

      if (clientId) {
        query += ' AND b.client_id = ?';
        params.push(clientId);
      }

      if (branchId) {
        query += ' AND r.branch_id = ?';
        params.push(branchId);
      }

      query += `
        GROUP BY DATE_FORMAT(r.pickup_date, '%Y-%m-%d')
        ORDER BY date DESC
      `;

      console.log('getDateSummaries - Query:', query);
      console.log('getDateSummaries - Parameters:', params);

      const [summaries] = await db.query(query, params);
      console.log(`getDateSummaries - Found ${summaries.length} date summaries`);
      
      // DATE_FORMAT already returns string in YYYY-MM-DD format, but ensure it's clean
      const formattedSummaries = summaries.map(summary => ({
        ...summary,
        date: summary.date ? String(summary.date).split('T')[0].split(' ')[0] : summary.date
      }));
      
      console.log('getDateSummaries - First summary date (as string):', formattedSummaries[0]?.date);
      console.log('getDateSummaries - First summary date type:', typeof formattedSummaries[0]?.date);
      res.json(formattedSummaries);
    } catch (error) {
      console.error('Error fetching date summaries:', error);
      res.status(500).json({ message: 'Error fetching date summaries', error: error.message });
    }
  }
};

module.exports = runController; 