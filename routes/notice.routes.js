const express = require('express');
const router = express.Router();
const noticeController = require('../controllers/noticeController');

// Get all notices
router.get('/', noticeController.getNotices);

// Create a new notice
router.post('/', noticeController.createNotice);

// Update a notice
router.patch('/:id', noticeController.updateNotice);

// Delete a notice
router.delete('/:id', noticeController.deleteNotice);

// Toggle notice status
router.patch('/:id/status', noticeController.toggleNoticeStatus);

module.exports = router; 