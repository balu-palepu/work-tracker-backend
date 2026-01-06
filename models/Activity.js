const mongoose = require('mongoose');
const encryption = require('../utils/encryption');

const activitySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  meetings: [{
    title: {
      type: String,
      required: true,
      trim: true
    },
    duration: {
      type: Number, // in minutes
      required: true,
      min: 0
    },
    summary: {
      type: String,
      trim: true
    },
    attendees: [{
      type: String,
      trim: true
    }],
    isConfidential: {
      type: Boolean,
      default: false
    },
    startTime: Date,
    endTime: Date
  }],
  tasks: [{
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    timeSpent: {
      type: Number, // in minutes
      required: true,
      min: 0
    },
    status: {
      type: String,
      enum: ['completed', 'in-progress', 'pending', 'blocked'],
      default: 'in-progress'
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    },
    category: {
      type: String,
      enum: ['development', 'bug-fix', 'review', 'testing', 'documentation', 'meeting', 'other'],
      default: 'other'
    },
    isConfidential: {
      type: Boolean,
      default: false
    }
  }],
  extraActivities: [{
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    duration: {
      type: Number, // in minutes
      min: 0
    },
    type: {
      type: String,
      enum: ['learning', 'training', 'break', 'admin', 'other'],
      default: 'other'
    }
  }],
  notes: {
    type: String,
    trim: true
  },
  mood: {
    type: String,
    enum: ['excellent', 'good', 'neutral', 'tired', 'stressed'],
    default: 'neutral'
  },
  productivity: {
    type: Number,
    min: 1,
    max: 10,
    default: 5
  },
  totalWorkHours: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
activitySchema.index({ user: 1, date: -1 });
activitySchema.index({ user: 1, createdAt: -1 });

// Calculate total work hours before saving
activitySchema.pre('save', function(next) {
  let totalMinutes = 0;
  
  // Add meeting durations
  if (this.meetings && this.meetings.length > 0) {
    totalMinutes += this.meetings.reduce((sum, meeting) => sum + meeting.duration, 0);
  }
  
  // Add task durations
  if (this.tasks && this.tasks.length > 0) {
    totalMinutes += this.tasks.reduce((sum, task) => sum + task.timeSpent, 0);
  }
  
  // Add extra activity durations
  if (this.extraActivities && this.extraActivities.length > 0) {
    totalMinutes += this.extraActivities.reduce((sum, activity) => 
      sum + (activity.duration || 0), 0);
  }
  
  this.totalWorkHours = parseFloat((totalMinutes / 60).toFixed(2));
  next();
});

// Encrypt confidential meeting summaries before saving
activitySchema.pre('save', function(next) {
  if (this.meetings && this.meetings.length > 0) {
    this.meetings.forEach(meeting => {
      if (meeting.isConfidential && meeting.summary && !meeting.summary.includes(':')) {
        meeting.summary = encryption.encrypt(meeting.summary);
      }
    });
  }
  
  if (this.tasks && this.tasks.length > 0) {
    this.tasks.forEach(task => {
      if (task.isConfidential && task.description && !task.description.includes(':')) {
        task.description = encryption.encrypt(task.description);
      }
    });
  }
  
  next();
});

// Decrypt confidential data after finding
activitySchema.post('find', function(docs) {
  if (docs && Array.isArray(docs)) {
    docs.forEach(doc => decryptActivityData(doc));
  }
});

activitySchema.post('findOne', function(doc) {
  if (doc) decryptActivityData(doc);
});

function decryptActivityData(doc) {
  if (doc.meetings && doc.meetings.length > 0) {
    doc.meetings.forEach(meeting => {
      if (meeting.isConfidential && meeting.summary && meeting.summary.includes(':')) {
        meeting.summary = encryption.decrypt(meeting.summary);
      }
    });
  }
  
  if (doc.tasks && doc.tasks.length > 0) {
    doc.tasks.forEach(task => {
      if (task.isConfidential && task.description && task.description.includes(':')) {
        task.description = encryption.decrypt(task.description);
      }
    });
  }
}

// Static method to get user statistics
activitySchema.statics.getUserStats = async function(userId, startDate, endDate) {
  const activities = await this.find({
    user: userId,
    date: { $gte: startDate, $lte: endDate }
  });
  
  const stats = {
    totalDays: activities.length,
    totalHours: 0,
    totalMeetings: 0,
    totalTasks: 0,
    avgProductivity: 0,
    tasksByStatus: {},
    tasksByCategory: {},
    moodDistribution: {}
  };
  
  activities.forEach(activity => {
    stats.totalHours += activity.totalWorkHours;
    stats.totalMeetings += activity.meetings.length;
    stats.totalTasks += activity.tasks.length;
    stats.avgProductivity += activity.productivity;
    
    // Count tasks by status
    activity.tasks.forEach(task => {
      stats.tasksByStatus[task.status] = (stats.tasksByStatus[task.status] || 0) + 1;
      stats.tasksByCategory[task.category] = (stats.tasksByCategory[task.category] || 0) + 1;
    });
    
    // Count mood distribution
    stats.moodDistribution[activity.mood] = (stats.moodDistribution[activity.mood] || 0) + 1;
  });
  
  if (activities.length > 0) {
    stats.avgProductivity = parseFloat((stats.avgProductivity / activities.length).toFixed(1));
    stats.avgHoursPerDay = parseFloat((stats.totalHours / activities.length).toFixed(2));
  }
  
  return stats;
};

module.exports = mongoose.model('Activity', activitySchema);
