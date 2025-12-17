const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database/db');
const staffController = require('./controllers/staffController');
const roleController = require('./controllers/roleController');
const { upload } = require('./config/cloudinary');
const uploadController = require('./controllers/uploadController');
const teamController = require('./controllers/teamController');
const vehicleController = require('./controllers/vehicleController');
const vehicleModelController = require('./controllers/vehicleModelController');
const clientController = require('./controllers/clientController');
const branchController = require('./controllers/branchController');
const serviceChargeController = require('./controllers/serviceChargeController');
const processingFeeController = require('./controllers/processingFeeController');
const noticeController = require('./controllers/noticeController');
const noticeRoutes = require('./routes/notice.routes');
const auditController = require('./controllers/auditController');
const auditService = require('./services/auditService');
const { extractUserInfo } = require('./middleware/auditMiddleware');
const { authenticateToken } = require('./middleware/auth');
const { DateTime } = require('luxon');
require('dotenv').config();

const app = express();

// Trust proxy to get real IP addresses (important for production)
app.set('trust proxy', true);

// CORS configuration for all environments
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://bm-control-room.vercel.app', 
    'https://bm-control-room-w2ud.vercel.app', 
    'http://localhost:5173', 
    'http://localhost:5174', 
    'http://localhost:5005',
    'http://139.59.44.175:5005'
  ];
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use(express.json());

// Apply authentication middleware to extract user info from JWT tokens
// This sets req.user for all requests, allowing audit logging to work
app.use(authenticateToken);

// Helper function to map database fields to frontend fields
const mapRequestFields = (request) => ({
  id: request.id,
  userId: request.user_id,
  userName: request.user_name,
  serviceTypeId: request.service_type_id,
  serviceTypeName: request.service_type_name,
  pickupLocation: request.pickup_location,
  deliveryLocation: request.delivery_location,
  pickupDate: request.pickup_date,
  description: request.description,
  priority: request.priority,
  status: request.status,
  myStatus: request.my_status,
  branchId: request.branch_id,
  branchName: request.branch_id === 0 ? request.client_name : request.branch_name,
  clientName: request.branch_id === 0 ? request.client_name : request.client_name,
  price: request.price,
  latitude: request.latitude,
  longitude: request.longitude,
  team_id: request.team_id,
  createdAt: request.created_at,
  updatedAt: request.updated_at
});

// Auth routes
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('Login attempt received:', req.body);
    const { username, password } = req.body;

    if (!username || !password) {
      console.log('Missing username or password');
      return res.status(400).json({ message: 'Username and password are required' });
    }

    // Get user from database
    console.log('Querying database for user:', username);
    const [users] = await db.query(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );

    console.log('Database query result:', users);

    if (users.length === 0) {
      console.log('No user found with username:', username);
      
      // Log failed login attempt (user not found)
      const userInfo = extractUserInfo(req);
      await auditService.logActivity({
        staffId: null,
        staffName: null,
        staffUsername: username,
        action: 'LOGIN_FAILED',
        entityType: 'user',
        entityId: null,
        details: { username, reason: 'User not found' },
        ipAddress: userInfo.ipAddress,
        userAgent: userInfo.userAgent
      });
      
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = users[0];

    // Compare password
    console.log('Comparing passwords...');
    const isValidPassword = await bcrypt.compare(password, user.password);
    console.log('Password comparison result:', isValidPassword);

    if (!isValidPassword) {
      console.log('Invalid password for user:', username);
      
      // Log failed login attempt (invalid password)
      const userInfo = extractUserInfo(req);
      await auditService.logActivity({
        staffId: user.id,
        staffName: user.username,
        staffUsername: username,
        action: 'LOGIN_FAILED',
        entityType: 'user',
        entityId: user.id,
        details: { username, reason: 'Invalid password' },
        ipAddress: userInfo.ipAddress,
        userAgent: userInfo.userAgent
      });
      
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Create JWT token
    console.log('Creating JWT token for user:', username);
    const token = jwt.sign(
      { 
        userId: user.id,
        username: user.username,
        role: user.role 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    console.log('Login successful for user:', username);
    
    // Log successful login to audit trail
    const userInfo = extractUserInfo(req);
    await auditService.logActivity({
      staffId: user.id,
      staffName: user.username,
      staffUsername: user.username,
      action: 'LOGIN',
      entityType: 'user',
      entityId: user.id,
      details: { username: user.username, email: user.email, role: user.role },
      ipAddress: userInfo.ipAddress,
      userAgent: userInfo.userAgent
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    
    // Log failed login attempt to audit trail
    try {
      const userInfo = extractUserInfo(req);
      await auditService.logActivity({
        staffId: null,
        staffName: null,
        staffUsername: req.body.username || null,
        action: 'LOGIN_FAILED',
        entityType: 'user',
        entityId: null,
        details: { username: req.body.username, reason: 'Invalid credentials or server error' },
        ipAddress: userInfo.ipAddress,
        userAgent: userInfo.userAgent
      });
    } catch (auditError) {
      console.error('Error logging failed login attempt:', auditError);
    }
    
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Add this endpoint after the auth routes
app.patch('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email } = req.body;
    if (!username && !email) {
      return res.status(400).json({ message: 'No fields to update' });
    }
    // Build dynamic SET clause
    const updates = [];
    const values = [];
    if (username) {
      updates.push('username = ?');
      values.push(username);
    }
    if (email) {
      updates.push('email = ?');
      values.push(email);
    }
    values.push(id);
    const setClause = updates.join(', ');
    await db.query(`UPDATE users SET ${setClause} WHERE id = ?`, values);
    // Fetch updated user (excluding password)
    const [users] = await db.query('SELECT id, username, email, role, created_at, updated_at FROM users WHERE id = ?', [id]);
    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(users[0]);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Add this endpoint after the user update endpoint
app.patch('/api/users/:id/password', async (req, res) => {
  try {
    const { id } = req.params;
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: 'Old and new password are required' });
    }
    // Fetch user
    const [users] = await db.query('SELECT password FROM users WHERE id = ?', [id]);
    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    const user = users[0];
    // Verify old password
    const isValid = await bcrypt.compare(oldPassword, user.password);
    if (!isValid) {
      return res.status(400).json({ message: 'Old password is incorrect' });
    }
    // Hash new password
    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, id]);
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Service Types routes
app.get('/api/service-types', async (req, res) => {
  try {
    const [serviceTypes] = await db.query(
      'SELECT * FROM service_types ORDER BY name'
    );
    res.json(serviceTypes);
  } catch (error) {
    console.error('Error fetching service types:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/service-types/:id', async (req, res) => {
  try {
    const [serviceTypes] = await db.query(
      'SELECT * FROM service_types WHERE id = ?',
      [req.params.id]
    );

    if (serviceTypes.length === 0) {
      return res.status(404).json({ message: 'Service type not found' });
    }

    res.json(serviceTypes[0]);
  } catch (error) {
    console.error('Error fetching service type:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Requests routes
// Get unique dates for done requests (my_status = 3)
app.get('/api/requests/done/dates', async (req, res) => {
  try {
    const { year, month } = req.query;
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
});

app.get('/api/requests', async (req, res) => {
  try {
    const { status, myStatus } = req.query;
    console.log('API Request - Query params:', { status, myStatus, typeOfMyStatus: typeof myStatus });
    
    let query = `
      SELECT r.*, b.name as branch_name, st.name as service_type_name, 
             COALESCE(r.client_name, c.name) as client_name
      FROM requests r
      LEFT JOIN branches b ON r.branch_id = b.id
      LEFT JOIN service_types st ON r.service_type_id = st.id
      LEFT JOIN clients c ON b.client_id = c.id
    `;
    const params = [];

    // Add filters if provided
    if (status || myStatus !== undefined) {
      query += ' WHERE';
      if (status) {
        query += ' r.status = ?';
        params.push(status);
      }
      if (myStatus !== undefined) {
        if (status) query += ' AND';
        query += ' r.my_status = ?';
        params.push(myStatus);
      }
    }

    query += ' ORDER BY r.created_at DESC';
    
    const [requests] = await db.query(query, params);
    const mappedRequests = requests.map(mapRequestFields);
    
    res.json(mappedRequests);
  } catch (error) {
    console.error('Error fetching requests:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/requests', async (req, res) => {
  try {
    const { 
      userId, 
      userName, 
      serviceTypeId,
      pickupLocation, 
      deliveryLocation, 
      pickupDate, 
      description, 
      priority,
      myStatus = 0,
      branchId,
      price,
      latitude,
      longitude,
      clientName
    } = req.body;

    console.log('Received request data:', {
      userId,
      userName,
      serviceTypeId,
      pickupLocation,
      deliveryLocation,
      pickupDate,
      description,
      priority,
      myStatus,
      branchId,
      price,
      latitude,
      longitude,
      clientName
    });

    console.log('Branch ID details:', { branchId, type: typeof branchId, isZero: branchId === 0, isStringZero: branchId === '0' });

    // Validate required fields (allow branchId = 0 for Adhoc requests)
    if (!userId || !userName || !serviceTypeId || !pickupLocation || !deliveryLocation || !pickupDate || (branchId === null || branchId === undefined) || !price) {
      console.log('Missing required fields:', {
        userId: !userId,
        userName: !userName,
        serviceTypeId: !serviceTypeId,
        pickupLocation: !pickupLocation,
        deliveryLocation: !deliveryLocation,
        pickupDate: !pickupDate,
        branchId: branchId === null || branchId === undefined,
        price: !price
      });
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Check if service type exists
    const [serviceTypes] = await db.query(
      'SELECT id FROM service_types WHERE id = ?',
      [serviceTypeId]
    );

    if (serviceTypes.length === 0) {
      console.error('Service type not found:', serviceTypeId);
      return res.status(400).json({ message: 'Invalid service type' });
    }

    // Check if user exists
    const [users] = await db.query(
      'SELECT id FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      console.error('User not found:', userId);
      return res.status(400).json({ message: 'Invalid user' });
    }

    // Check if branch exists (skip for Adhoc requests with branchId = 0)
    if (branchId !== 0 && branchId !== '0') {
      const [branches] = await db.query(
        'SELECT id FROM branches WHERE id = ?',
        [branchId]
      );

      if (branches.length === 0) {
        console.error('Branch not found:', branchId);
        return res.status(400).json({ message: 'Invalid branch' });
      }
    }

    // Convert pickup_date to Nairobi timezone
    let nairobiPickupDate = pickupDate;
    try {
      // Parse the incoming date (could be in various formats)
      let dt = DateTime.fromISO(pickupDate, { zone: 'Africa/Nairobi' });
      
      // If ISO parsing fails, try SQL format
      if (!dt.isValid) {
        dt = DateTime.fromSQL(pickupDate, { zone: 'Africa/Nairobi' });
      }
      
      // If still invalid, try as local time and convert to Nairobi
      if (!dt.isValid) {
        dt = DateTime.fromISO(pickupDate);
        if (dt.isValid) {
          dt = dt.setZone('Africa/Nairobi');
        }
      }
      
      if (dt.isValid) {
        nairobiPickupDate = dt.setZone('Africa/Nairobi').toSQL({ includeOffset: false });
      } else {
        console.warn('Could not parse pickup_date, using original:', pickupDate);
      }
    } catch (error) {
      console.error('Error converting pickup_date to Nairobi timezone:', error);
      // Use original if conversion fails
    }

    // Insert the request with price and coordinates
    const [result] = await db.query(
      `INSERT INTO requests (
        user_id, user_name, service_type_id, branch_id, 
        pickup_location, delivery_location, pickup_date, 
        description, priority, status, my_status, price,
        latitude, longitude, client_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, userName, serviceTypeId, branchId,
        pickupLocation, deliveryLocation, nairobiPickupDate,
        description || null, priority || 'medium', 'pending', myStatus, price,
        latitude || null, longitude || null, clientName || null
      ]
    );

    // Fetch the created request with service type and branch names
    const [requests] = await db.query(
      `SELECT r.*, 
              st.name as service_type_name,
              b.name as branch_name,
              COALESCE(c.name, r.client_name) as client_name
       FROM requests r
       LEFT JOIN service_types st ON r.service_type_id = st.id
       LEFT JOIN branches b ON r.branch_id = b.id
       LEFT JOIN clients c ON b.client_id = c.id
       WHERE r.id = ?`,
      [result.insertId]
    );

    // Get service type and branch names for audit log
    const serviceTypeName = requests[0]?.service_type_name || null;
    const branchName = requests[0]?.branch_name || (branchId === 0 ? clientName : null);

    // Log audit trail
    const userInfo = extractUserInfo(req);
    await auditService.logActivity({
      staffId: userId || userInfo.staffId,
      staffName: userName || userInfo.staffName,
      staffUsername: userName || userInfo.staffUsername,
      action: 'CREATE_REQUEST',
      entityType: 'request',
      entityId: result.insertId,
      details: {
        serviceTypeId,
        serviceTypeName,
        branchId,
        branchName,
        pickupLocation,
        deliveryLocation,
        price
      },
      ipAddress: userInfo.ipAddress,
      userAgent: userInfo.userAgent
    });

    res.status(201).json(mapRequestFields(requests[0]));
  } catch (error) {
    console.error('Error creating request:', error);
    res.status(500).json({ message: 'Error creating request', error: error.message });
  }
});

app.patch('/api/requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Map frontend field names to database field names
    const dbUpdates = {
      user_name: updates.userName,
      service_type_id: updates.serviceTypeId,
      pickup_location: updates.pickupLocation,
      delivery_location: updates.deliveryLocation,
      pickup_date: updates.pickupDate,
      description: updates.description,
      priority: updates.priority,
      status: updates.status,
      my_status: updates.myStatus,
      team_id: updates.team_id,
      latitude: updates.latitude,
      longitude: updates.longitude
    };

    // If team_id is present, fetch crew_commander_id and set staff_id
    if (updates.team_id) {
      const [teamRows] = await db.query('SELECT crew_commander_id FROM teams WHERE id = ?', [updates.team_id]);
      if (teamRows.length > 0 && teamRows[0].crew_commander_id) {
        dbUpdates.staff_id = teamRows[0].crew_commander_id;
      }
    }

    // Remove undefined values
    Object.keys(dbUpdates).forEach(key => 
      dbUpdates[key] === undefined && delete dbUpdates[key]
    );

    // Build the SET clause dynamically based on provided updates
    const setClause = Object.keys(dbUpdates)
      .map(key => `${key} = ?`)
      .join(', ');
    
    const values = [...Object.values(dbUpdates), id];

    await db.query(
      `UPDATE requests SET ${setClause} WHERE id = ?`,
      values
    );

    // Get the updated request with team and service type info
    const [requests] = await db.query(
      `SELECT r.*, 
              t.name as team_name,
              st.name as service_type_name,
              b.name as branch_name,
              COALESCE(c.name, r.client_name) as client_name
       FROM requests r
       LEFT JOIN teams t ON r.team_id = t.id
       LEFT JOIN service_types st ON r.service_type_id = st.id
       LEFT JOIN branches b ON r.branch_id = b.id
       LEFT JOIN clients c ON b.client_id = c.id
       WHERE r.id = ?`,
      [id]
    );

    if (requests.length === 0) {
      return res.status(404).json({ message: 'Request not found' });
    }

    // Log audit trail if team was assigned
    if (updates.team_id) {
      const userInfo = extractUserInfo(req);
      const teamName = requests[0]?.team_name || null;
      const serviceTypeName = requests[0]?.service_type_name || null;
      const branchName = requests[0]?.branch_name || (requests[0]?.branch_id === 0 ? requests[0]?.client_name : null);
      
      await auditService.logActivity({
        staffId: userInfo.staffId,
        staffName: userInfo.staffName,
        staffUsername: userInfo.staffUsername,
        action: 'ASSIGN_TEAM_TO_REQUEST',
        entityType: 'request',
        entityId: parseInt(id),
        details: {
          teamId: updates.team_id,
          teamName: teamName,
          requestId: parseInt(id),
          serviceTypeName: serviceTypeName,
          branchName: branchName,
          status: updates.status || requests[0]?.status,
          myStatus: updates.myStatus !== undefined ? updates.myStatus : requests[0]?.my_status
        },
        ipAddress: userInfo.ipAddress,
        userAgent: userInfo.userAgent
      });
    }

    res.json(mapRequestFields(requests[0]));
  } catch (error) {
    console.error('Error updating request:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Requests routes
app.get('/api/runs/summaries', async (req, res) => {
  try {
    const { year, month, clientId, branchId } = req.query;
    let query = `
      SELECT 
        DATE(r.pickup_date) as date,
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
      GROUP BY DATE(r.pickup_date)
      ORDER BY date DESC
    `;

    console.log('Fetching run summaries with query:', query);
    console.log('Parameters:', params);

    const [summaries] = await db.query(query, params);
    console.log(`Found ${summaries.length} date summaries`);
    res.json(summaries);
  } catch (error) {
    console.error('Error fetching run summaries:', error);
    res.status(500).json({ message: 'Error fetching run summaries', error: error.message });
  }
});

// Staff routes
app.get('/api/staff', staffController.getAllStaff);
app.get('/api/staff/:id', staffController.getStaffById);
app.post('/api/staff', staffController.createStaff);
app.put('/api/staff/:id', staffController.updateStaff);
app.delete('/api/staff/:id', staffController.deleteStaff);
app.put('/api/staff/:id/status', staffController.updateStaffStatus);

// Roles routes
app.get('/api/roles', roleController.getAllRoles);

// Upload routes
app.post('/api/upload', upload.single('photo'), uploadController.uploadImage);

// Team routes
app.post('/api/teams', teamController.createTeam);
app.get('/api/teams', teamController.getTeams);
app.get('/api/teams/check-today', teamController.checkTeamsForToday);

// Vehicle Model routes
app.get('/api/vehicle-models', vehicleModelController.getAllVehicleModels);
app.get('/api/vehicle-models/active', vehicleModelController.getActiveVehicleModels);
app.get('/api/vehicle-models/:id', vehicleModelController.getVehicleModel);
app.post('/api/vehicle-models', vehicleModelController.createVehicleModel);
app.put('/api/vehicle-models/:id', vehicleModelController.updateVehicleModel);
app.delete('/api/vehicle-models/:id', vehicleModelController.deleteVehicleModel);
app.put('/api/vehicle-models/:id/status', vehicleModelController.updateVehicleModelStatus);

// Vehicle routes
app.get('/api/vehicles', vehicleController.getAllVehicles);
app.get('/api/vehicles/:id', vehicleController.getVehicle);
app.post('/api/vehicles', vehicleController.createVehicle);
app.put('/api/vehicles/:id', vehicleController.updateVehicle);
app.delete('/api/vehicles/:id', vehicleController.deleteVehicle);
app.put('/api/vehicles/:id/status', vehicleController.updateVehicleStatus);

// Client routes
app.get('/api/clients', clientController.getAllClients);
app.get('/api/clients/:id', clientController.getClient);
app.post('/api/clients', clientController.createClient);
app.put('/api/clients/:id', clientController.updateClient);
app.delete('/api/clients/:id', clientController.deleteClient);
app.get('/api/branches', branchController.getAllBranchesWithoutClient);
app.get('/api/clients/:clientId/branches', branchController.getAllBranches);
app.post('/api/clients/:clientId/branches', branchController.createBranch);
app.put('/api/clients/:clientId/branches/:branchId', branchController.updateBranch);
app.delete('/api/clients/:clientId/branches/:branchId', branchController.deleteBranch);
app.get('/api/clients/:clientId/service-charges', serviceChargeController.getServiceCharges);
app.post('/api/clients/:clientId/service-charges', serviceChargeController.createServiceCharge);
app.put('/api/clients/:clientId/service-charges/:chargeId', serviceChargeController.updateServiceCharge);
app.delete('/api/clients/:clientId/service-charges/:chargeId', serviceChargeController.deleteServiceCharge);

// Processing Fee routes
app.get('/api/clients/:clientId/processing-fees', processingFeeController.getProcessingFees);
app.post('/api/clients/:clientId/processing-fees', processingFeeController.createProcessingFee);
app.put('/api/clients/:clientId/processing-fees/:feeId', processingFeeController.updateProcessingFee);
app.delete('/api/clients/:clientId/processing-fees/:feeId', processingFeeController.deleteProcessingFee);

// Notice routes
app.use('/api/notices', noticeRoutes);

// Audit log routes
app.get('/api/audit-logs', auditController.getAuditLogs);
app.get('/api/audit-logs/:id', auditController.getAuditLog);

// Logout endpoint
app.post('/api/auth/logout', async (req, res) => {
  try {
    // Extract user info from request (may be in body, query, or headers)
    const userInfo = extractUserInfo(req);
    const userId = req.body.userId || req.query.userId || userInfo.staffId;
    const username = req.body.username || req.query.username || userInfo.staffUsername;

    // Log logout to audit trail
    if (userId || username) {
      await auditService.logActivity({
        staffId: userId || null,
        staffName: username || null,
        staffUsername: username || null,
        action: 'LOGOUT',
        entityType: 'user',
        entityId: userId || null,
        details: { username: username || 'Unknown' },
        ipAddress: userInfo.ipAddress,
        userAgent: userInfo.userAgent
      });
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Error logging logout:', error);
    // Still return success even if audit logging fails
    res.json({ message: 'Logged out successfully' });
  }
});

// SOS routes
app.get('/api/sos', async (req, res) => {
  try {
    const query = `
      SELECT s.*, st.name as guard_name
      FROM sos s
      LEFT JOIN staff st ON s.guard_id = st.id
      ORDER BY s.created_at DESC
    `;
    
    const [sosList] = await db.query(query);
    res.json(sosList);
  } catch (error) {
    console.error('Error fetching SOS list:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/sos/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, comment } = req.body;

    // Validate status
    const validStatuses = ['pending', 'in_progress', 'resolved'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    // Fetch current SOS record to get old status
    const [currentSos] = await db.query(`
      SELECT s.*, st.name as guard_name
      FROM sos s
      LEFT JOIN staff st ON s.guard_id = st.id
      WHERE s.id = ?
    `, [id]);

    if (!currentSos || currentSos.length === 0) {
      return res.status(404).json({ message: 'SOS record not found' });
    }

    const oldStatus = currentSos[0].status;
    const sosData = currentSos[0];

    const query = `
      UPDATE sos 
      SET status = ?,
          comment = ?
      WHERE id = ?
    `;
    
    await db.query(query, [status, comment || null, id]);
    
    // Fetch updated SOS record
    const [updatedSos] = await db.query(`
      SELECT s.*, st.name as guard_name
      FROM sos s
      LEFT JOIN staff st ON s.guard_id = st.id
      WHERE s.id = ?
    `, [id]);

    // Log audit trail
    const userInfo = extractUserInfo(req);
    await auditService.logActivity({
      staffId: userInfo.staffId,
      staffName: userInfo.staffName,
      staffUsername: userInfo.staffUsername,
      action: 'UPDATE_SOS_STATUS',
      entityType: 'sos',
      entityId: parseInt(id),
      details: {
        sosId: parseInt(id),
        sosType: sosData.sos_type,
        oldStatus: oldStatus,
        newStatus: status,
        comment: comment || null,
        guardName: sosData.guard_name,
        staffId: sosData.staff_id,
        latitude: sosData.latitude,
        longitude: sosData.longitude
      },
      ipAddress: userInfo.ipAddress,
      userAgent: userInfo.userAgent
    });

    res.json(updatedSos[0]);
  } catch (error) {
    console.error('Error updating SOS status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is running' });
});

app.get('/',(req, res) => {
  res.send('API IS WORKING');
});

// Example API endpoint
app.get('/api/test', (req, res) => {
  db.query('SELECT 1 + 1 AS solution')
    .then(([results]) => {
      res.json({ message: 'Database connection successful', results });
    })
    .catch(err => {
      res.status(500).json({ error: err.message });
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5005;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app; 
