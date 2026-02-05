const express = require('express');
const router = express.Router({ mergeParams: true });
const { protect } = require('../middleware/auth');
const { setTeamContext } = require('../middleware/teamContext');
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  streamNotifications
} = require('../controllers/notificationController');

// All routes require authentication and team context
router.use(protect);
router.use(setTeamContext);

// Notification routes
router.get('/', getNotifications);
router.get('/stream', streamNotifications);
router.put('/mark-all-read', markAllAsRead);
router.put('/:notificationId/read', markAsRead);
router.delete('/:notificationId', deleteNotification);

module.exports = router;
