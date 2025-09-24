const db = require('../database/db');

const vehicleModelController = {
  getAllVehicleModels: async (req, res) => {
    try {
      const [models] = await db.query(
        'SELECT * FROM vehicle_models ORDER BY name ASC'
      );
      res.json(models);
    } catch (error) {
      console.error('Error fetching vehicle models:', error);
      res.status(500).json({ message: 'Error fetching vehicle models', error: error.message });
    }
  },

  getActiveVehicleModels: async (req, res) => {
    try {
      const [models] = await db.query(
        'SELECT * FROM vehicle_models WHERE status = 1 ORDER BY name ASC'
      );
      res.json(models);
    } catch (error) {
      console.error('Error fetching active vehicle models:', error);
      res.status(500).json({ message: 'Error fetching active vehicle models', error: error.message });
    }
  },

  getVehicleModel: async (req, res) => {
    try {
      const { id } = req.params;
      const [models] = await db.query(
        'SELECT * FROM vehicle_models WHERE id = ?',
        [id]
      );
      
      if (models.length === 0) {
        return res.status(404).json({ message: 'Vehicle model not found' });
      }
      
      res.json(models[0]);
    } catch (error) {
      console.error('Error fetching vehicle model:', error);
      res.status(500).json({ message: 'Error fetching vehicle model', error: error.message });
    }
  },

  createVehicleModel: async (req, res) => {
    try {
      const { name, consumption } = req.body;

      // Validate required fields
      if (!name || !consumption) {
        return res.status(400).json({ 
          message: 'Name and consumption are required' 
        });
      }

      // Check if model name already exists
      const [existingModels] = await db.query(
        'SELECT id FROM vehicle_models WHERE name = ?',
        [name]
      );

      if (existingModels.length > 0) {
        return res.status(400).json({ 
          message: 'Vehicle model with this name already exists' 
        });
      }

      // Create the vehicle model
      const [result] = await db.query(
        'INSERT INTO vehicle_models (name, consumption) VALUES (?, ?)',
        [name, consumption]
      );

      // Fetch the created model
      const [models] = await db.query(
        'SELECT * FROM vehicle_models WHERE id = ?',
        [result.insertId]
      );

      res.status(201).json(models[0]);
    } catch (error) {
      console.error('Error creating vehicle model:', error);
      res.status(500).json({ message: 'Error creating vehicle model', error: error.message });
    }
  },

  updateVehicleModel: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, consumption, status } = req.body;

      // Check if model exists
      const [existingModels] = await db.query(
        'SELECT id FROM vehicle_models WHERE id = ?',
        [id]
      );

      if (existingModels.length === 0) {
        return res.status(404).json({ message: 'Vehicle model not found' });
      }

      // If name is being updated, check for duplicates
      if (name) {
        const [duplicateModels] = await db.query(
          'SELECT id FROM vehicle_models WHERE name = ? AND id != ?',
          [name, id]
        );

        if (duplicateModels.length > 0) {
          return res.status(400).json({ 
            message: 'Vehicle model with this name already exists' 
          });
        }
      }

      // Build dynamic update query
      const updates = [];
      const values = [];

      if (name !== undefined) {
        updates.push('name = ?');
        values.push(name);
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
        `UPDATE vehicle_models SET ${updates.join(', ')} WHERE id = ?`,
        values
      );

      // Fetch the updated model
      const [models] = await db.query(
        'SELECT * FROM vehicle_models WHERE id = ?',
        [id]
      );

      res.json(models[0]);
    } catch (error) {
      console.error('Error updating vehicle model:', error);
      res.status(500).json({ message: 'Error updating vehicle model', error: error.message });
    }
  },

  deleteVehicleModel: async (req, res) => {
    try {
      const { id } = req.params;

      // Check if model exists
      const [existingModels] = await db.query(
        'SELECT id FROM vehicle_models WHERE id = ?',
        [id]
      );

      if (existingModels.length === 0) {
        return res.status(404).json({ message: 'Vehicle model not found' });
      }

      // Check if any vehicles are using this model
      const [vehiclesUsingModel] = await db.query(
        'SELECT id FROM vehicles WHERE model_id = ?',
        [id]
      );

      if (vehiclesUsingModel.length > 0) {
        return res.status(400).json({ 
          message: 'Cannot delete vehicle model. There are vehicles using this model.' 
        });
      }

      await db.query('DELETE FROM vehicle_models WHERE id = ?', [id]);

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting vehicle model:', error);
      res.status(500).json({ message: 'Error deleting vehicle model', error: error.message });
    }
  },

  updateVehicleModelStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      // Validate status
      if (status !== 0 && status !== 1) {
        return res.status(400).json({ 
          message: 'Status must be 0 (inactive) or 1 (active)' 
        });
      }

      // Check if model exists
      const [existingModels] = await db.query(
        'SELECT id FROM vehicle_models WHERE id = ?',
        [id]
      );

      if (existingModels.length === 0) {
        return res.status(404).json({ message: 'Vehicle model not found' });
      }

      await db.query(
        'UPDATE vehicle_models SET status = ? WHERE id = ?',
        [status, id]
      );

      // Fetch the updated model
      const [models] = await db.query(
        'SELECT * FROM vehicle_models WHERE id = ?',
        [id]
      );

      res.json(models[0]);
    } catch (error) {
      console.error('Error updating vehicle model status:', error);
      res.status(500).json({ message: 'Error updating vehicle model status', error: error.message });
    }
  }
};

module.exports = vehicleModelController;
