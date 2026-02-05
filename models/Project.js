const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Project name is required'],
    trim: true,
    maxlength: [100, 'Project name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  color: {
    type: String,
    default: '#3B82F6', // Blue
    match: [/^#[0-9A-F]{6}$/i, 'Please enter a valid hex color']
  },

  // Team ownership (replaces single user)
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

  // Team Lead for the project
  teamLead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Legacy field for backward compatibility (can be removed after migration)
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Project type
  type: {
    type: String,
    enum: {
      values: ['kanban', 'sprint'],
      message: '{VALUE} is not a valid project type'
    },
    default: 'kanban'
  },

  // Sprint support
  currentSprint: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sprint'
  },

  // Project settings
  settings: {
    estimationUnit: {
      type: String,
      enum: ['hours', 'story_points', 'days'],
      default: 'hours'
    },
    allowTimeTracking: {
      type: Boolean,
      default: true
    },
    requireEstimates: {
      type: Boolean,
      default: false
    }
  },

  // Visibility control
  visibility: {
    type: String,
    enum: {
      values: ['team', 'restricted'],
      message: '{VALUE} is not a valid visibility option'
    },
    default: 'team' // All team members can see
  },

  // Archive management
  isArchived: {
    type: Boolean,
    default: false
  },
  archivedAt: {
    type: Date
  },
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for performance
projectSchema.index({ team: 1, isArchived: 1, createdAt: -1 });
projectSchema.index({ team: 1, type: 1 });
projectSchema.index({ currentSprint: 1 });
projectSchema.index({ user: 1, createdAt: -1 }); // Legacy index for backward compatibility

// Virtual for member count
projectSchema.virtual('memberCount', {
  ref: 'ProjectMember',
  localField: '_id',
  foreignField: 'project',
  count: true
});

// Set toJSON options
projectSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Project', projectSchema);