const mongoose = require('mongoose');

const sprintSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Sprint name is required'],
    trim: true,
    maxlength: [100, 'Sprint name cannot exceed 100 characters']
  },

  // References
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: [true, 'Project is required']
  },
  team: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    required: [true, 'Team is required']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator is required']
  },

  // Sprint dates
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required'],
    validate: {
      validator: function(value) {
        return value > this.startDate;
      },
      message: 'End date must be after start date'
    }
  },

  // Sprint status
  status: {
    type: String,
    enum: {
      values: ['planning', 'active', 'completed', 'cancelled'],
      message: '{VALUE} is not a valid sprint status'
    },
    default: 'planning'
  },

  // Sprint goal
  goal: {
    type: String,
    trim: true,
    maxlength: [500, 'Sprint goal cannot exceed 500 characters']
  },

  // Capacity planning
  capacity: {
    type: Number,
    min: [0, 'Capacity cannot be negative'],
    default: 0
  },

  // Sprint metrics
  metrics: {
    totalStoryPoints: {
      type: Number,
      default: 0,
      min: 0
    },
    completedStoryPoints: {
      type: Number,
      default: 0,
      min: 0
    },
    totalTasks: {
      type: Number,
      default: 0,
      min: 0
    },
    completedTasks: {
      type: Number,
      default: 0,
      min: 0
    },
    velocity: {
      type: Number,
      default: 0,
      min: 0
    },
    // Burndown data: array of daily remaining story points
    burndownData: [{
      date: {
        type: Date,
        required: true
      },
      remainingPoints: {
        type: Number,
        required: true,
        min: 0
      },
      completedPoints: {
        type: Number,
        default: 0,
        min: 0
      }
    }]
  },

  // Sprint retrospective
  retrospective: {
    whatWentWell: {
      type: String,
      trim: true
    },
    whatNeedImprovement: {
      type: String,
      trim: true
    },
    actionItems: [{
      type: String,
      trim: true
    }],
    completedAt: {
      type: Date
    },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },

  // Dates tracking
  actualStartDate: {
    type: Date
  },
  actualEndDate: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes for performance
sprintSchema.index({ team: 1, project: 1, status: 1 });
sprintSchema.index({ project: 1, startDate: -1 });
sprintSchema.index({ status: 1, endDate: 1 });
sprintSchema.index({ team: 1, status: 1 });

// Calculate sprint duration in days
sprintSchema.virtual('duration').get(function() {
  if (this.startDate && this.endDate) {
    const diffTime = Math.abs(this.endDate - this.startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }
  return 0;
});

// Calculate sprint progress percentage
sprintSchema.virtual('progress').get(function() {
  if (this.metrics.totalStoryPoints > 0) {
    return Math.round((this.metrics.completedStoryPoints / this.metrics.totalStoryPoints) * 100);
  }
  return 0;
});

// Check if sprint is overdue
sprintSchema.virtual('isOverdue').get(function() {
  if (this.status === 'active' && this.endDate) {
    return new Date() > this.endDate;
  }
  return false;
});

// Calculate days remaining
sprintSchema.virtual('daysRemaining').get(function() {
  if (this.status === 'active' && this.endDate) {
    const diffTime = this.endDate - new Date();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }
  return 0;
});

// Method to start sprint
sprintSchema.methods.start = function() {
  if (this.status !== 'planning') {
    throw new Error('Only sprints in planning status can be started');
  }
  this.status = 'active';
  this.actualStartDate = new Date();

  // Initialize burndown data with first data point
  this.metrics.burndownData = [{
    date: new Date(),
    remainingPoints: this.metrics.totalStoryPoints,
    completedPoints: 0
  }];

  return this.save();
};

// Method to complete sprint
sprintSchema.methods.complete = function() {
  if (this.status !== 'active') {
    throw new Error('Only active sprints can be completed');
  }
  this.status = 'completed';
  this.actualEndDate = new Date();

  // Calculate final velocity
  this.metrics.velocity = this.metrics.completedStoryPoints;

  // Add final burndown data point
  this.metrics.burndownData.push({
    date: new Date(),
    remainingPoints: this.metrics.totalStoryPoints - this.metrics.completedStoryPoints,
    completedPoints: this.metrics.completedStoryPoints
  });

  return this.save();
};

// Method to cancel sprint
sprintSchema.methods.cancel = function() {
  if (this.status === 'completed') {
    throw new Error('Cannot cancel a completed sprint');
  }
  this.status = 'cancelled';
  return this.save();
};

// Method to update metrics
sprintSchema.methods.updateMetrics = async function() {
  const Task = mongoose.model('Task');

  // Get all tasks for this sprint
  const tasks = await Task.find({ sprint: this._id });

  // Calculate totals
  this.metrics.totalTasks = tasks.length;
  this.metrics.completedTasks = tasks.filter(t => t.status === 'completed').length;

  // Calculate story points
  this.metrics.totalStoryPoints = tasks.reduce((sum, task) => sum + (task.storyPoints || 0), 0);
  this.metrics.completedStoryPoints = tasks
    .filter(t => t.status === 'completed')
    .reduce((sum, task) => sum + (task.storyPoints || 0), 0);

  return this.save();
};

// Method to add burndown data point
sprintSchema.methods.addBurndownDataPoint = function() {
  const remainingPoints = this.metrics.totalStoryPoints - this.metrics.completedStoryPoints;

  // Check if we already have a data point for today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existingPoint = this.metrics.burndownData.find(point => {
    const pointDate = new Date(point.date);
    pointDate.setHours(0, 0, 0, 0);
    return pointDate.getTime() === today.getTime();
  });

  if (existingPoint) {
    // Update existing point
    existingPoint.remainingPoints = remainingPoints;
    existingPoint.completedPoints = this.metrics.completedStoryPoints;
  } else {
    // Add new point
    this.metrics.burndownData.push({
      date: today,
      remainingPoints,
      completedPoints: this.metrics.completedStoryPoints
    });
  }

  return this.save();
};

// Method to check if user can manage sprint
sprintSchema.methods.canManage = async function(userId) {
  const ProjectMember = mongoose.model('ProjectMember');
  const TeamMember = mongoose.model('TeamMember');

  // Check team admin
  const teamMember = await TeamMember.findOne({
    team: this.team,
    user: userId,
    status: 'active'
  });

  if (teamMember && teamMember.role === 'admin') {
    return true;
  }

  // Check project permissions
  const projectMember = await ProjectMember.findOne({
    project: this.project,
    user: userId
  });

  if (projectMember) {
    return projectMember.permissions.canManageSprints;
  }

  return false;
};

// toJSON options
sprintSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

const Sprint = mongoose.model('Sprint', sprintSchema);

module.exports = Sprint;
