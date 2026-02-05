const mongoose = require('mongoose');

const bandwidthReportSchema = new mongoose.Schema({
  // User and team references
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required']
  },
  team: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    required: [true, 'Team is required']
  },

  // Report period
  month: {
    type: Number,
    required: [true, 'Month is required'],
    min: [1, 'Month must be between 1 and 12'],
    max: [12, 'Month must be between 1 and 12']
  },
  year: {
    type: Number,
    required: [true, 'Year is required'],
    min: [2020, 'Year must be 2020 or later']
  },

  // Availability data
  totalWorkingDays: {
    type: Number,
    required: [true, 'Total working days is required'],
    min: [0, 'Total working days cannot be negative']
  },
  availableDays: {
    type: Number,
    required: [true, 'Available days is required'],
    min: [0, 'Available days cannot be negative']
  },

  // Project allocations
  allocations: [{
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true
    },
    allocatedDays: {
      type: Number,
      required: true,
      min: [0, 'Allocated days cannot be negative']
    },
    allocatedPercentage: {
      type: Number,
      min: [0, 'Percentage cannot be negative'],
      max: [100, 'Percentage cannot exceed 100']
    }
  }],

  // Planned leave/time off
  plannedLeave: [{
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    type: {
      type: String,
      enum: ['vacation', 'sick', 'personal', 'other'],
      default: 'vacation'
    },
    reason: {
      type: String,
      trim: true
    }
  }],

  // Additional notes
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
  },

  // Status tracking
  status: {
    type: String,
    enum: {
      values: ['draft', 'submitted', 'approved', 'rejected'],
      message: '{VALUE} is not a valid status'
    },
    default: 'draft'
  },

  // Submission tracking
  submittedAt: {
    type: Date
  },

  // Approval tracking
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  },
  rejectionReason: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Compound unique index - one report per user per month/year per team
bandwidthReportSchema.index({ team: 1, user: 1, year: -1, month: -1 }, { unique: true });

// Additional indexes for queries
bandwidthReportSchema.index({ team: 1, status: 1 });
bandwidthReportSchema.index({ user: 1, year: -1, month: -1 });
bandwidthReportSchema.index({ team: 1, year: -1, month: -1 });

// Virtual for report period display
bandwidthReportSchema.virtual('periodDisplay').get(function() {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${monthNames[this.month - 1]} ${this.year}`;
});

// Virtual for utilization percentage
bandwidthReportSchema.virtual('utilizationPercentage').get(function() {
  if (this.totalWorkingDays === 0) return 0;
  return Math.round((this.availableDays / this.totalWorkingDays) * 100);
});

// Calculate total allocated days
bandwidthReportSchema.virtual('totalAllocatedDays').get(function() {
  return this.allocations.reduce((sum, alloc) => sum + alloc.allocatedDays, 0);
});

// Check if over-allocated
bandwidthReportSchema.virtual('isOverAllocated').get(function() {
  return this.totalAllocatedDays > this.availableDays;
});

// Calculate leave days
bandwidthReportSchema.virtual('totalLeaveDays').get(function() {
  return this.plannedLeave.reduce((sum, leave) => {
    const diffTime = Math.abs(new Date(leave.endDate) - new Date(leave.startDate));
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end
    return sum + diffDays;
  }, 0);
});

// Pre-save hook to calculate allocation percentages
bandwidthReportSchema.pre('save', function(next) {
  // Calculate percentages for allocations
  if (this.allocations && this.availableDays > 0) {
    this.allocations.forEach(allocation => {
      allocation.allocatedPercentage = Math.round((allocation.allocatedDays / this.availableDays) * 100);
    });
  }

  // Set submittedAt when status changes to submitted
  if (this.isModified('status') && this.status === 'submitted' && !this.submittedAt) {
    this.submittedAt = new Date();
  }

  next();
});

// Method to submit report
bandwidthReportSchema.methods.submit = function() {
  if (this.status !== 'draft') {
    throw new Error('Only draft reports can be submitted');
  }

  // Validate allocations
  const totalAllocated = this.allocations.reduce((sum, alloc) => sum + alloc.allocatedDays, 0);
  if (totalAllocated > this.availableDays) {
    throw new Error('Total allocated days cannot exceed available days');
  }

  this.status = 'submitted';
  this.submittedAt = new Date();
  return this.save();
};

// Method to approve report
bandwidthReportSchema.methods.approve = function(approverId) {
  if (this.status !== 'submitted') {
    throw new Error('Only submitted reports can be approved');
  }

  this.status = 'approved';
  this.approvedBy = approverId;
  this.approvedAt = new Date();
  this.rejectionReason = undefined;
  return this.save();
};

// Method to reject report
bandwidthReportSchema.methods.reject = function(reason) {
  if (this.status !== 'submitted') {
    throw new Error('Only submitted reports can be rejected');
  }

  this.status = 'rejected';
  this.rejectionReason = reason;
  return this.save();
};

// toJSON options
bandwidthReportSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

const BandwidthReport = mongoose.model('BandwidthReport', bandwidthReportSchema);

module.exports = BandwidthReport;
