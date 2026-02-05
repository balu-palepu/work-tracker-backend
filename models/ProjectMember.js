const mongoose = require('mongoose');

const projectMemberSchema = new mongoose.Schema({
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: [true, 'Project is required']
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required']
  },
  role: {
    type: String,
    enum: {
      values: ['owner', 'manager', 'contributor', 'viewer'],
      message: '{VALUE} is not a valid role'
    },
    default: 'contributor'
  },
  permissions: {
    canEditProject: {
      type: Boolean,
      default: false
    },
    canManageSprints: {
      type: Boolean,
      default: false
    },
    canAssignTasks: {
      type: Boolean,
      default: false
    },
    canDeleteTasks: {
      type: Boolean,
      default: false
    },
    canInviteMembers: {
      type: Boolean,
      default: false
    }
  },
  workload: {
    type: Number,
    min: [0, 'Workload cannot be negative'],
    max: [100, 'Workload cannot exceed 100%'],
    default: 0
  },
  addedAt: {
    type: Date,
    default: Date.now
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Compound unique index (one user can only have one role per project)
projectMemberSchema.index({ project: 1, user: 1 }, { unique: true });

// Additional indexes for common queries
projectMemberSchema.index({ user: 1 });
projectMemberSchema.index({ project: 1, role: 1 });

// Set permissions based on role before saving
projectMemberSchema.pre('save', function(next) {
  if (this.isModified('role')) {
    switch (this.role) {
      case 'owner':
        this.permissions = {
          canEditProject: true,
          canManageSprints: true,
          canAssignTasks: true,
          canDeleteTasks: true,
          canInviteMembers: true
        };
        break;
      case 'manager':
        this.permissions = {
          canEditProject: true,
          canManageSprints: true,
          canAssignTasks: true,
          canDeleteTasks: true,
          canInviteMembers: true
        };
        break;
      case 'contributor':
        this.permissions = {
          canEditProject: false,
          canManageSprints: false,
          canAssignTasks: true,
          canDeleteTasks: false,
          canInviteMembers: false
        };
        break;
      case 'viewer':
        this.permissions = {
          canEditProject: false,
          canManageSprints: false,
          canAssignTasks: false,
          canDeleteTasks: false,
          canInviteMembers: false
        };
        break;
    }
  }
  next();
});

// Method to check if user has specific permission
projectMemberSchema.methods.hasPermission = function(permission) {
  return this.permissions[permission] === true;
};

// Method to check if user is owner or manager
projectMemberSchema.methods.canManage = function() {
  return this.role === 'owner' || this.role === 'manager';
};

// toJSON options
projectMemberSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

const ProjectMember = mongoose.model('ProjectMember', projectMemberSchema);

module.exports = ProjectMember;
