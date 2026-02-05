const Notification = require('../models/Notification');
const { notificationEmitter, emitNotification } = require('../services/notificationStream');

/**
 * @desc    Get user's notifications
 * @route   GET /api/teams/:teamId/notifications
 * @access  Private
 */
exports.getNotifications = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { limit = 50, unreadOnly = false } = req.query;

    const query = {
      team: teamId,
      recipient: req.user._id
    };

    if (unreadOnly === 'true') {
      query.isRead = false;
    }

    const notifications = await Notification.find(query)
      .populate('actor', 'name email')
      .populate('relatedTask', 'title')
      .populate('relatedProject', 'name')
      .populate('relatedSprint', 'name')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    const unreadCount = await Notification.countDocuments({
      team: teamId,
      recipient: req.user._id,
      isRead: false
    });

    res.json({
      success: true,
      count: notifications.length,
      unreadCount,
      data: notifications
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications',
      error: error.message
    });
  }
};

/**
 * @desc    Mark notification as read
 * @route   PUT /api/teams/:teamId/notifications/:notificationId/read
 * @access  Private
 */
exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.notificationId);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Check ownership
    if (notification.recipient.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    await notification.markAsRead();

    res.json({
      success: true,
      data: notification
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking notification as read',
      error: error.message
    });
  }
};

/**
 * @desc    Mark all notifications as read
 * @route   PUT /api/teams/:teamId/notifications/mark-all-read
 * @access  Private
 */
exports.markAllAsRead = async (req, res) => {
  try {
    const { teamId } = req.params;

    await Notification.updateMany(
      {
        team: teamId,
        recipient: req.user._id,
        isRead: false
      },
      {
        isRead: true,
        readAt: new Date()
      }
    );

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking all as read',
      error: error.message
    });
  }
};

/**
 * @desc    Delete notification
 * @route   DELETE /api/teams/:teamId/notifications/:notificationId
 * @access  Private
 */
exports.deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.notificationId);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Check ownership
    if (notification.recipient.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    await notification.deleteOne();

    res.json({
      success: true,
      message: 'Notification deleted'
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting notification',
      error: error.message
    });
  }
};

/**
 * @desc    Stream notifications via SSE
 * @route   GET /api/teams/:teamId/notifications/stream
 * @access  Private
 */
exports.streamNotifications = async (req, res) => {
  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const sendEvent = (notification) => {
      if (!notification) return;
      const recipientId = notification.recipient?.toString?.() || notification.recipient;
      const teamId = notification.team?.toString?.() || notification.team;

      if (recipientId !== req.user._id.toString()) return;
      if (teamId !== req.params.teamId) return;

      const payload = notification.toJSON ? notification.toJSON() : notification;
      res.write(`event: notification\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    notificationEmitter.on('notification', sendEvent);

    const keepAlive = setInterval(() => {
      res.write(`event: ping\n`);
      res.write(`data: {}\n\n`);
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      notificationEmitter.off('notification', sendEvent);
    });
  } catch (error) {
    console.error('Stream notifications error:', error);
    res.end();
  }
};

/**
 * Helper function to create notifications (used by other controllers)
 */
exports.createNotification = async (data) => {
  try {
    const notification = await Notification.createNotification(data);
    if (!notification) return null;
    await notification.populate([
      { path: 'actor', select: 'name email' },
      { path: 'relatedTask', select: 'title' },
      { path: 'relatedProject', select: 'name' },
      { path: 'relatedSprint', select: 'name' }
    ]);
    emitNotification(notification);
    return notification;
  } catch (error) {
    console.error('Create notification error:', error);
    return null;
  }
};
