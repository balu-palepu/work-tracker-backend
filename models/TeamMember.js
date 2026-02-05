const mongoose = require("mongoose");

const teamMemberSchema = new mongoose.Schema(
  {
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: [true, "Team is required"],
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
    role: {
      type: String,
      enum: {
        values: ["admin", "Manager", "member", "viewer"],
        message: "{VALUE} is not a valid role",
      },
      default: "member",
    },
    permissions: {
      canCreateProjects: {
        type: Boolean,
        default: false,
      },
      canManageTeam: {
        type: Boolean,
        default: false,
      },
      canViewReports: {
        type: Boolean,
        default: false,
      },
      canManageSprints: {
        type: Boolean,
        default: false,
      },
    },
    status: {
      type: String,
      enum: {
        values: ["active", "invited", "suspended"],
        message: "{VALUE} is not a valid status",
      },
      default: "active",
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reportingManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    customTitle: {
      type: String,
      trim: true,
      maxlength: [100, "Custom title cannot exceed 100 characters"],
    },
  },
  {
    timestamps: true,
  },
);

// Create compound unique index (one user can only be in a team once)
teamMemberSchema.index({ team: 1, user: 1 }, { unique: true });

// Additional indexes for common queries
teamMemberSchema.index({ user: 1, status: 1 });
teamMemberSchema.index({ team: 1, role: 1 });
teamMemberSchema.index({ team: 1, status: 1, createdAt: -1 });

// Set permissions based on role before saving
teamMemberSchema.pre("save", function (next) {
  if (this.isModified("role")) {
    switch (this.role) {
      case "admin":
        this.permissions = {
          canCreateProjects: true,
          canManageTeam: true,
          canViewReports: true,
          canManageSprints: true,
        };
        break;
      case "Manager":
        this.permissions = {
          canCreateProjects: true,
          canManageTeam: false,
          canViewReports: true,
          canManageSprints: true,
        };
        break;
      case "member":
        this.permissions = {
          canCreateProjects: false,
          canManageTeam: false,
          canViewReports: false,
          canManageSprints: false,
        };
        break;
      case "viewer":
        this.permissions = {
          canCreateProjects: false,
          canManageTeam: false,
          canViewReports: false,
          canManageSprints: false,
        };
        break;
    }
  }
  next();
});

// Method to check if user has specific permission
teamMemberSchema.methods.hasPermission = function (permission) {
  return this.permissions[permission] === true;
};

// Method to check if user is admin
teamMemberSchema.methods.isAdmin = function () {
  return this.role === "admin";
};

// toJSON options
teamMemberSchema.set("toJSON", {
  virtuals: true,
  transform: function (doc, ret) {
    delete ret.__v;
    return ret;
  },
});

const TeamMember = mongoose.model("TeamMember", teamMemberSchema);

module.exports = TeamMember;
