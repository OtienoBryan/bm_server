const db = require('../database/db');
const auditService = require('../services/auditService');
const { extractUserInfo } = require('../middleware/auditMiddleware');

const teamController = {
  createTeam: async (req, res) => {
    const { name, members, vehicles } = req.body;
    
    if (!name || !members || !Array.isArray(members)) {
      return res.status(400).json({ 
        message: 'Invalid team data. Name and members array are required.' 
      });
    }
    
    try {
      console.log('Creating team:', { name, members, vehicles });
      
      // Find the crew commander (team leader) id
      let crewCommanderId = null;
      if (Array.isArray(members) && members.length > 0) {
        // Query staff table for these members and find the one with role 'Team Leader'
        const [staffRows] = await db.query(
          `SELECT id, role FROM staff WHERE id IN (${members.map(() => '?').join(',')})`,
          members
        );
        const teamLeader = staffRows.find(row => row.role === 'Team Leader');
        if (teamLeader) {
          crewCommanderId = teamLeader.id;
        }
      }
      // Create the team with crew_commander_id
      const [result] = await db.query(
        'INSERT INTO teams (name, crew_commander_id) VALUES (?, ?)',
        [name, crewCommanderId]
      );
      
      const teamId = result.insertId;
      console.log('Team created with ID:', teamId);
      
      // Add team members
      for (const memberId of members) {
        await db.query(
          'INSERT INTO team_members (team_id, staff_id) VALUES (?, ?)',
          [teamId, memberId]
        );
      }
      
      // Add team vehicles if provided
      if (vehicles && Array.isArray(vehicles)) {
        for (const vehicleId of vehicles) {
          await db.query(
            'INSERT INTO team_vehicles (team_id, vehicle_id) VALUES (?, ?)',
            [teamId, vehicleId]
          );
        }
      }
      
      // Get the created team with members and vehicles
      const [team] = await db.query(`
        SELECT t.*, 
          JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', s.id,
              'name', s.name,
              'role', s.role,
              'photo_url', s.photo_url,
              'empl_no', s.empl_no,
              'id_no', s.id_no,
              'status', s.status
            )
          ) as members,
          JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', v.id,
              'registration_number', v.registration_number,
              'model_name', vm.name,
              'consumption', v.consumption,
              'status', v.status
            )
          ) as vehicles
        FROM teams t
        LEFT JOIN team_members tm ON t.id = tm.team_id
        LEFT JOIN staff s ON tm.staff_id = s.id
        LEFT JOIN team_vehicles tv ON t.id = tv.team_id
        LEFT JOIN vehicles v ON tv.vehicle_id = v.id
        LEFT JOIN vehicle_models vm ON v.model_id = vm.id
        WHERE t.id = ?
        GROUP BY t.id
      `, [teamId]);
      
      // Parse the members and vehicles JSON strings
      team[0].members = JSON.parse(team[0].members);
      team[0].vehicles = JSON.parse(team[0].vehicles);
      
      // Filter out null values from vehicles
      team[0].vehicles = team[0].vehicles.filter(vehicle => vehicle.id !== null);
      
      // Log audit trail
      const userInfo = extractUserInfo(req);
      await auditService.logActivity({
        staffId: userInfo.staffId,
        staffName: userInfo.staffName,
        staffUsername: userInfo.staffUsername,
        action: 'CREATE_TEAM',
        entityType: 'team',
        entityId: teamId,
        details: {
          teamName: name,
          teamId: teamId,
          crewCommanderId: crewCommanderId,
          memberIds: members,
          memberNames: team[0].members.map(m => m.name),
          vehicleIds: vehicles || [],
          vehicleRegistrations: team[0].vehicles.map(v => v.registration_number)
        },
        ipAddress: userInfo.ipAddress,
        userAgent: userInfo.userAgent
      });
      
      console.log('Team created successfully:', team[0]);
      res.status(201).json(team[0]);
    } catch (error) {
      console.error('Error creating team:', error);
      res.status(500).json({ 
        message: 'Error creating team',
        error: error.message 
      });
    }
  },

  getTeams: async (req, res) => {
    try {
      const { today } = req.query;
      console.log('Fetching teams with today param:', today); // Debug log
      
      const query = `
        SELECT 
          t.*,
          COALESCE(
            JSON_ARRAYAGG(
              CASE 
                WHEN s.id IS NOT NULL THEN
                  JSON_OBJECT(
                    'id', s.id,
                    'name', s.name,
                    'role', s.role,
                    'photo_url', s.photo_url,
                    'empl_no', s.empl_no,
                    'id_no', s.id_no,
                    'status', s.status
                  )
                ELSE NULL
              END
            ),
            JSON_ARRAY()
          ) as members,
          COALESCE(
            JSON_ARRAYAGG(
              CASE 
                WHEN v.id IS NOT NULL THEN
                  JSON_OBJECT(
                    'id', v.id,
                    'registration_number', v.registration_number,
                    'model_name', vm.name,
                    'consumption', v.consumption,
                    'status', v.status
                  )
                ELSE NULL
              END
            ),
            JSON_ARRAY()
          ) as vehicles
        FROM teams t
        LEFT JOIN team_members tm ON t.id = tm.team_id
        LEFT JOIN staff s ON tm.staff_id = s.id
        LEFT JOIN team_vehicles tv ON t.id = tv.team_id
        LEFT JOIN vehicles v ON tv.vehicle_id = v.id
        LEFT JOIN vehicle_models vm ON v.model_id = vm.id
        ${today === 'true' ? 'WHERE DATE(t.created_at) = CURDATE()' : ''}
        GROUP BY t.id
        ORDER BY t.created_at DESC
      `;
      
      const [teams] = await db.query(query);
      console.log('Raw teams data:', teams); // Debug log
      console.log('Found teams:', teams.length); // Debug log
      
      // Check for duplicate team_members entries
      const [duplicateMembers] = await db.query(`
        SELECT team_id, staff_id, COUNT(*) as count
        FROM team_members
        GROUP BY team_id, staff_id
        HAVING COUNT(*) > 1
      `);
      
      if (duplicateMembers.length > 0) {
        console.warn('Found duplicate team_members entries:', duplicateMembers);
        
        // Clean up duplicate entries
        for (const duplicate of duplicateMembers) {
          await db.query(`
            DELETE FROM team_members 
            WHERE team_id = ? AND staff_id = ? 
            LIMIT ?
          `, [duplicate.team_id, duplicate.staff_id, duplicate.count - 1]);
        }
        console.log('Cleaned up duplicate team_members entries');
      }
      
      // Check for duplicate team_vehicles entries
      const [duplicateVehicles] = await db.query(`
        SELECT team_id, vehicle_id, COUNT(*) as count
        FROM team_vehicles
        GROUP BY team_id, vehicle_id
        HAVING COUNT(*) > 1
      `);
      
      if (duplicateVehicles.length > 0) {
        console.warn('Found duplicate team_vehicles entries:', duplicateVehicles);
        
        // Clean up duplicate entries
        for (const duplicate of duplicateVehicles) {
          await db.query(`
            DELETE FROM team_vehicles 
            WHERE team_id = ? AND vehicle_id = ? 
            LIMIT ?
          `, [duplicate.team_id, duplicate.vehicle_id, duplicate.count - 1]);
        }
        console.log('Cleaned up duplicate team_vehicles entries');
      }
      
      // Parse the members and vehicles JSON strings for each team and filter out null values
      teams.forEach(team => {
        try {
          console.log('Team members before parsing:', team.members); // Debug log
          const parsedMembers = JSON.parse(team.members || '[]');
          team.members = parsedMembers.filter(member => member !== null);
          
          // Remove duplicates based on member ID
          const uniqueMembers = team.members.filter((member, index, self) => 
            index === self.findIndex(m => m.id === member.id)
          );
          team.members = uniqueMembers;
          
          console.log('Team members after deduplication:', team.members); // Debug log
          
          console.log('Team vehicles before parsing:', team.vehicles); // Debug log
          const parsedVehicles = JSON.parse(team.vehicles || '[]');
          team.vehicles = parsedVehicles.filter(vehicle => vehicle !== null);
          
          // Remove duplicates based on vehicle ID
          const uniqueVehicles = team.vehicles.filter((vehicle, index, self) => 
            index === self.findIndex(v => v.id === vehicle.id)
          );
          team.vehicles = uniqueVehicles;
          
          console.log('Team vehicles after deduplication:', team.vehicles); // Debug log
        } catch (error) {
          console.error('Error parsing team data:', error);
          team.members = [];
          team.vehicles = [];
        }
      });
      
      res.json(teams);
    } catch (error) {
      console.error('Error fetching teams:', error);
      res.status(500).json({ message: 'Error fetching teams' });
    }
  },

  checkTeamsForToday: async (req, res) => {
    try {
      const query = `
        SELECT COUNT(*) as teamCount
        FROM teams 
        WHERE DATE(created_at) = CURDATE()
      `;
      
      const [result] = await db.query(query);
      const teamCount = result[0].teamCount;
      
      res.json({ 
        hasTeamsToday: teamCount > 0,
        teamCount: teamCount
      });
    } catch (error) {
      console.error('Error checking teams for today:', error);
      res.status(500).json({ message: 'Error checking teams for today' });
    }
  }
};

module.exports = teamController; 