const express = require('express');
const {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} = require('../controllers/notificationController');
const protect = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/unread-count', protect, getUnreadNotificationCount);
router.patch('/read-all', protect, markAllNotificationsAsRead);
router.patch('/:notificationId/read', protect, markNotificationAsRead);
router.get('/', protect, getNotifications);

module.exports = router;
