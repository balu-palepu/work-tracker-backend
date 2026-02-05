const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Team name is required'],
    trim: true,
    maxlength: [100, 'Team name cannot exceed 100 characters']
  },
  slug: {
    type: String,
    unique: true,
    trim: true,
    lowercase: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  logo: {
    type: String,
    trim: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Team owner is required']
  },
  settings: {
    timezone: {
      type: String,
      default: 'UTC'
    },
    workingHours: {
      start: {
        type: String,
        default: '09:00'
      },
      end: {
        type: String,
        default: '17:00'
      }
    },
    defaultSprintDuration: {
      type: Number,
      default: 14,
      min: [1, 'Sprint duration must be at least 1 day'],
      max: [30, 'Sprint duration cannot exceed 30 days']
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Create indexes
teamSchema.index({ slug: 1 });
teamSchema.index({ owner: 1 });
teamSchema.index({ isActive: 1, createdAt: -1 });

// Generate slug from name before saving
teamSchema.pre('save', function(next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Add random suffix if slug exists
    if (!this.isNew) {
      this.slug += '-' + Math.random().toString(36).substr(2, 6);
    }
  }
  next();
});

// Virtual for member count
teamSchema.virtual('memberCount', {
  ref: 'TeamMember',
  localField: '_id',
  foreignField: 'team',
  count: true
});

// toJSON options
teamSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

const Team = mongoose.model('Team', teamSchema);

module.exports = Team;
