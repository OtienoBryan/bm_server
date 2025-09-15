const db = require('../database/db');

const vehicleController = {
  getAllVehicles: async (req, res) => {
    try {
      const [vehicles] = await db.query(`
        SELECT v.*, vm.name as model_name, vm.consumption as model_consumption
        FROM vehicles v
        LEFT JOIN vehicle_models vm ON v.model_id = vm.id
        ORDER BY v.created_at DESC
      `);
      res.json(vehicles);
    } catch (error) {
      console.error('Error fetching vehicles:', error);
      res.status(500).json({ message: 'Error fetching vehicles', error: error.message });
    }
  },

  getVehicle: async (req, res) => {
    try {
      const { id } = req.params;
      const [vehicles] = await db.query(`
        SELECT v.*, vm.name as model_name, vm.consumption as model_consumption
        FROM vehicles v
        LEFT JOIN vehicle_models vm ON v.model_id = vm.id
        WHERE v.id = ?
      `, [id]);
      
      if (vehicles.length === 0) {
        return res.status(404).json({ message: 'Vehicle not found' });
      }
      
      res.json(vehicles[0]);
    } catch (error) {
      console.error('Error fetching vehicle:', error);
      res.status(500).json({ message: 'Error fetching vehicle', error: error.message });
    }
  },

  createVehicle: async (req, res) => {
    try {
      const { registration_number, model_id, consumption } = req.body;

      // Validate required fields
      if (!registration_number || !model_id || !consumption) {
        return res.status(400).json({ 
          message: 'Registration number, model, and consumption are required' 
        });
      }

      // Check if registration number already exists
      const [existingVehicles] = await db.query(
        'SELECT id FROM vehicles WHERE registration_number = ?',
        [registration_number]
      );

      if (existingVehicles.length > 0) {
        return res.status(400).json({ 
          message: 'Vehicle with this registration number already exists' 
        });
      }

      // Check if model exists
      const [existingModels] = await db.query(
        'SELECT id FROM vehicle_models WHERE id = ? AND status = 1',
        [model_id]
      );

      if (existingModels.length === 0) {
        return res.status(400).json({ 
          message: 'Selected vehicle model not found or inactive' 
        });
      }

      // Create the vehicle
      const [result] = await db.query(
        'INSERT INTO vehicles (registration_number, model_id, consumption) VALUES (?, ?, ?)',
        [registration_number, model_id, consumption]
      );

      // Fetch the created vehicle with model info
      const [vehicles] = await db.query(`
        SELECT v.*, vm.name as model_name, vm.consumption as model_consumption
        FROM vehicles v
        LEFT JOIN vehicle_models vm ON v.model_id = vm.id
        WHERE v.id = ?
      `, [result.insertId]);

      res.status(201).json(vehicles[0]);
    } catch (error) {
      console.error('Error creating vehicle:', error);
      res.status(500).json({ message: 'Error creating vehicle', error: error.message });
    }
  },

  updateVehicle: async (req, res) => {
    try {
      const { id } = req.params;
      const { registration_number, model_id, consumption, status } = req.body;

      // Check if vehicle exists
      const [existingVehicles] = await db.query(
        'SELECT id FROM vehicles WHERE id = ?',
        [id]
      );

      if (existingVehicles.length === 0) {
        return res.status(404).json({ message: 'Vehicle not found' });
      }

      // If registration number is being updated, check for duplicates
      if (registration_number) {
        const [duplicateVehicles] = await db.query(
          'SELECT id FROM vehicles WHERE registration_number = ? AND id != ?',
          [registration_number, id]
        );

        if (duplicateVehicles.length > 0) {
          return res.status(400).json({ 
            message: 'Vehicle with this registration number already exists' 
          });
        }
      }

      // If model is being updated, check if it exists
      if (model_id) {
        const [existingModels] = await db.query(
          'SELECT id FROM vehicle_models WHERE id = ? AND status = 1',
          [model_id]
        );

        if (existingModels.length === 0) {
          return res.status(400).json({ 
            message: 'Selected vehicle model not found or inactive' 
          });
        }
      }

      // Build dynamic update query
      const updates = [];
      const values = [];

      if (registration_number !== undefined) {
        updates.push('registration_number = ?');
        values.push(registration_number);
      }
      if (model_id !== undefined) {
        updates.push('model_id = ?');
        values.push(model_id);
      }
      if (consumption !== undefined) {
        updates.push('consumption = ?');
        values.push(consumption);
      }
      if (status !== undefined) {
        updates.push('status = ?');
        values.push(status);
      }

      if (updates.length === 0) {
        return res.status(400).json({ message: 'No fields to update' });
      }

      values.push(id);

      await db.query(
        `UPDATE vehicles SET ${updates.join(', ')} WHERE id = ?`,
        values
      );

      // Fetch the updated vehicle with model info
      const [vehicles] = await db.query(`
        SELECT v.*, vm.name as model_name, vm.consumption as model_consumption
        FROM vehicles v
        LEFT JOIN vehicle_models vm ON v.model_id = vm.id
        WHERE v.id = ?
      `, [id]);

      res.json(vehicles[0]);
    } catch (error) {
      console.error('Error updating vehicle:', error);
      res.status(500).json({ message: 'Error updating vehicle', error: error.message });
    }
  },

  deleteVehicle: async (req, res) => {
    try {
      const { id } = req.params;

      // Check if vehicle exists
      const [existingVehicles] = await db.query(
        'SELECT id FROM vehicles WHERE id = ?',
        [id]
      );

      if (existingVehicles.length === 0) {
        return res.status(404).json({ message: 'Vehicle not found' });
      }

      await db.query('DELETE FROM vehicles WHERE id = ?', [id]);

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting vehicle:', error);
      res.status(500).json({ message: 'Error deleting vehicle', error: error.message });
    }
  },

  updateVehicleStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      // Validate status
      if (status !== 0 && status !== 1) {
        return res.status(400).json({ 
          message: 'Status must be 0 (inactive) or 1 (active)' 
        });
      }

      // Check if vehicle exists
      const [existingVehicles] = await db.query(
        'SELECT id FROM vehicles WHERE id = ?',
        [id]
      );

      if (existingVehicles.length === 0) {
        return res.status(404).json({ message: 'Vehicle not found' });
      }

      await db.query(
        'UPDATE vehicles SET status = ? WHERE id = ?',
        [status, id]
      );

      // Fetch the updated vehicle
      const [vehicles] = await db.query(
        'SELECT * FROM vehicles WHERE id = ?',
        [id]
      );

      res.json(vehicles[0]);
    } catch (error) {
      console.error('Error updating vehicle status:', error);
      res.status(500).json({ message: 'Error updating vehicle status', error: error.message });
    }
  }
};

module.exports = vehicleController;
