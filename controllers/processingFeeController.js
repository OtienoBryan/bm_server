const db = require('../database/db');

const processingFeeController = {
  getProcessingFees: async (req, res) => {
    try {
      const { clientId } = req.params;
      
      console.log('Get processing fees for client:', clientId);

      const [fees] = await db.query(
        'SELECT * FROM processing_fees WHERE client_id = ? ORDER BY created_at DESC',
        [clientId]
      );

      res.json(fees);
    } catch (error) {
      console.error('Error fetching processing fees:', error);
      res.status(500).json({ 
        message: 'Error fetching processing fees',
        error: error.message 
      });
    }
  },

  createProcessingFee: async (req, res) => {
    try {
      const { clientId } = req.params;
      const { fee_type, description, amount, is_percentage, is_active } = req.body;
      
      console.log('Create processing fee request:', {
        clientId,
        body: req.body
      });

      // Validate required fields
      if (!fee_type || amount === undefined) {
        return res.status(400).json({ 
          message: 'Fee type and amount are required' 
        });
      }

      // Check if client exists
      const [client] = await db.query(
        'SELECT id FROM clients WHERE id = ?',
        [clientId]
      );

      if (client.length === 0) {
        return res.status(404).json({ message: 'Client not found' });
      }

      // Create the processing fee
      const [result] = await db.query(
        'INSERT INTO processing_fees (client_id, fee_type, description, amount, is_percentage, is_active) VALUES (?, ?, ?, ?, ?, ?)',
        [clientId, fee_type, description || null, amount, is_percentage || false, is_active !== false]
      );

      // Fetch the newly created processing fee
      const [newFee] = await db.query(
        'SELECT * FROM processing_fees WHERE id = ?',
        [result.insertId]
      );

      res.status(201).json(newFee[0]);
    } catch (error) {
      console.error('Error creating processing fee:', error);
      res.status(500).json({ 
        message: 'Error creating processing fee',
        error: error.message 
      });
    }
  },

  updateProcessingFee: async (req, res) => {
    try {
      const { clientId, feeId } = req.params;
      const { fee_type, description, amount, is_percentage, is_active } = req.body;
      
      console.log('Update processing fee request:', {
        clientId,
        feeId,
        body: req.body
      });

      // Validate required fields
      if (!fee_type || amount === undefined) {
        return res.status(400).json({ 
          message: 'Fee type and amount are required' 
        });
      }

      // Check if processing fee exists and belongs to client
      const [existingFee] = await db.query(
        'SELECT * FROM processing_fees WHERE id = ? AND client_id = ?',
        [feeId, clientId]
      );

      if (existingFee.length === 0) {
        return res.status(404).json({ message: 'Processing fee not found' });
      }

      // Update the processing fee
      await db.query(
        'UPDATE processing_fees SET fee_type = ?, description = ?, amount = ?, is_percentage = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [fee_type, description || null, amount, is_percentage || false, is_active !== false, feeId]
      );

      // Fetch the updated processing fee
      const [updatedFee] = await db.query(
        'SELECT * FROM processing_fees WHERE id = ?',
        [feeId]
      );

      res.json(updatedFee[0]);
    } catch (error) {
      console.error('Error updating processing fee:', error);
      res.status(500).json({ 
        message: 'Error updating processing fee',
        error: error.message 
      });
    }
  },

  deleteProcessingFee: async (req, res) => {
    try {
      const { clientId, feeId } = req.params;
      
      console.log('Delete processing fee request:', {
        clientId,
        feeId
      });

      // Check if processing fee exists and belongs to client
      const [existingFee] = await db.query(
        'SELECT * FROM processing_fees WHERE id = ? AND client_id = ?',
        [feeId, clientId]
      );

      if (existingFee.length === 0) {
        return res.status(404).json({ message: 'Processing fee not found' });
      }

      // Delete the processing fee
      await db.query(
        'DELETE FROM processing_fees WHERE id = ?',
        [feeId]
      );

      res.json({ message: 'Processing fee deleted successfully' });
    } catch (error) {
      console.error('Error deleting processing fee:', error);
      res.status(500).json({ 
        message: 'Error deleting processing fee',
        error: error.message 
      });
    }
  }
};

module.exports = processingFeeController;



