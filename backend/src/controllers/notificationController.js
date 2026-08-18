const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');

function toSafeNotification(notification) {
  if (!notification) {
    return null;
  }

  return {
    id: String(notification._id),
    type: notification.type,
    title: notification.title,
    message: notification.message,
    relatedId: notification.relatedId ? String(notification.relatedId) : null,
    relatedType: notification.relatedType || null,
    isRead: notification.isRead === true,
    createdAt: notification.createdAt,
  };
}

const getNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ recipientId: req.user.id })
    .sort({ createdAt: -1 })
    .lean();

  return res.status(200).json({
    success: true,
    notifications: notifications.map(toSafeNotification).filter(Boolean),
  });
});

const getUnreadNotificationCount = asyncHandler(async (req, res) => {
  const unreadCount = await Notification.countDocuments({
    recipientId: req.user.id,
    isRead: false,
  });

  return res.status(200).json({
    success: true,
    unreadCount,
  });
});

const markNotificationAsRead = asyncHandler(async (req, res) => {
  const { notificationId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    return res.status(404).json({
      success: false,
      message: 'Notification not found.',
    });
  }

  const notification = await Notification.findOne({
    _id: notificationId,
    recipientId: req.user.id,
  });

  if (!notification) {
    return res.status(404).json({
      success: false,
      message: 'Notification not found.',
    });
  }

  if (!notification.isRead) {
    notification.isRead = true;
    await notification.save();
  }

  return res.status(200).json({
    success: true,
    message: 'Notification marked as read.',
    notification: toSafeNotification(notification),
  });
});

const markAllNotificationsAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { recipientId: req.user.id, isRead: false },
    { $set: { isRead: true } }
  );

  return res.status(200).json({
    success: true,
    message: 'All notifications marked as read.',
  });
});

module.exports = {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
};
