const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  // Recipient
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Recipient is required']
  },

  // Team context
  team: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    required: [true, 'Team is required']
  },

  // Notification type
  type: {
    type: String,
    enum: [
      'task_assigned',
      'task_updated',
      'task_completed',
      'task_comment',
      'task_reminder',
      'mention',
      'sprint_started',
      'sprint_completed',
      'project_added',
      'project_assigned',
      'bandwidth_approved',
      'bandwidth_rejected',
      'bandwidth_reminder',
      'team_invite',
      'role_changed'
    ],
    required: true
  },

  // Notification content
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    trim: true,
    maxlength: [500, 'Message cannot exceed 500 characters']
  },

  // Related entities
  relatedTask: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  },
  relatedProject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  relatedSprint: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sprint'
  },

  // Action URL
  actionUrl: {
    type: String,
    trim: true
  },

  // Actor (who triggered the notification)
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Read status
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes for performance
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ team: 1, recipient: 1 });
notificationSchema.index({ createdAt: -1 });

// Method to mark as read
notificationSchema.methods.markAsRead = function() {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

// Static method to create notification
notificationSchema.statics.createNotification = async function(data) {
  // Don't send notification to the actor
  if (data.recipient && data.actor && data.recipient.toString() === data.actor.toString()) {
    return null;
  }

  const notification = await this.create(data);
  return notification;
};

// toJSON options
notificationSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
