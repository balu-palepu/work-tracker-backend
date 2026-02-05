const Team = require("../models/Team");
const TeamMember = require("../models/TeamMember");
const User = require("../models/User");

/**
 * @desc    Create a new team
 * @route   POST /api/teams
 * @access  Private
 */
exports.createTeam = async (req, res) => {
  try {
    const { name, description, logo, settings } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Team name is required",
      });
    }

    // Create team
    const team = await Team.create({
      name,
      description,
      logo,
      owner: req.user._id,
      settings: settings || {},
    });

    // Create team membership for owner (admin role)
    await TeamMember.create({
      team: team._id,
      user: req.user._id,
      role: "admin",
      status: "active",
      joinedAt: new Date(),
    });

    res.status(201).json({
      success: true,
      data: team,
      message: "Team created successfully",
    });
  } catch (error) {
    console.error("Create team error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating team",
      error: error.message,
    });
  }
};

/**
 * @desc    Get all teams for current user
 * @route   GET /api/teams
 * @access  Private
 */
exports.getTeams = async (req, res) => {
  try {
    // Find all team memberships for user
    const memberships = await TeamMember.find({
      user: req.user._id,
      status: "active",
    })
      .populate({
        path: "team",
        match: { isActive: true },
      })
      .sort("-createdAt");

    // Extract teams and add role info + member counts
    const teams = await Promise.all(
      memberships
        .filter((m) => m.team) // Filter out null teams (deleted/inactive)
        .map(async (m) => {
          const memberCount = await TeamMember.countDocuments({
            team: m.team._id,
            status: "active",
          });

          return {
            ...m.team.toObject(),
            memberCount,
            userRole: m.role,
            userPermissions: m.permissions,
            membershipId: m._id,
          };
        }),
    );

    res.status(200).json({
      success: true,
      count: teams.length,
      data: teams,
    });
  } catch (error) {
    console.error("Get teams error:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving teams",
      error: error.message,
    });
  }
};

/**
 * @desc    Get single team by ID
 * @route   GET /api/teams/:teamId
 * @access  Private
 */
exports.getTeam = async (req, res) => {
  try {
    const team = req.team; // Already loaded by setTeamContext middleware

    // Get member count
    const memberCount = await TeamMember.countDocuments({
      team: team._id,
      status: "active",
    });

    // Add additional info
    const teamData = {
      ...team.toObject(),
      memberCount,
      userRole: req.teamMembership.role,
      userPermissions: req.teamMembership.permissions,
    };

    res.status(200).json({
      success: true,
      data: teamData,
    });
  } catch (error) {
    console.error("Get team error:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving team",
      error: error.message,
    });
  }
};

/**
 * @desc    Update team
 * @route   PUT /api/teams/:teamId
 * @access  Private (Admin only)
 */
exports.updateTeam = async (req, res) => {
  try {
    const { name, description, logo, settings } = req.body;
    const team = req.team;

    // Update fields
    if (name) team.name = name;
    if (description !== undefined) team.description = description;
    if (logo !== undefined) team.logo = logo;
    if (settings) team.settings = { ...team.settings, ...settings };

    await team.save();

    res.status(200).json({
      success: true,
      data: team,
      message: "Team updated successfully",
    });
  } catch (error) {
    console.error("Update team error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating team",
      error: error.message,
    });
  }
};

/**
 * @desc    Delete team
 * @route   DELETE /api/teams/:teamId
 * @access  Private (Owner only)
 */
exports.deleteTeam = async (req, res) => {
  try {
    const team = req.team;
    const teamId = team._id;

    // Import models for cascade delete
    const Project = require("../models/Project");
    const ProjectMember = require("../models/ProjectMember");
    const Task = require("../models/Tasks");
    const Sprint = require("../models/Sprint");
    const Notification = require("../models/Notification");
    const BandwidthReport = require("../models/BandwidthReport");
    const Activity = require("../models/Activity");

    // Get all projects in this team
    const projects = await Project.find({ team: teamId });
    const projectIds = projects.map(p => p._id);

    // Delete all related data (cascade delete)
    await Promise.all([
      // Delete all tasks in team projects
      Task.deleteMany({ project: { $in: projectIds } }),
      // Delete all sprints in team projects
      Sprint.deleteMany({ project: { $in: projectIds } }),
      // Delete all project members
      ProjectMember.deleteMany({ project: { $in: projectIds } }),
      // Delete all projects
      Project.deleteMany({ team: teamId }),
      // Delete all team members
      TeamMember.deleteMany({ team: teamId }),
      // Delete all notifications for this team
      Notification.deleteMany({ team: teamId }),
      // Delete all bandwidth reports for this team
      BandwidthReport.deleteMany({ team: teamId }),
      // Delete all activities for this team
      Activity.deleteMany({ team: teamId }),
    ]);

    // Delete the team itself
    await team.deleteOne();

    res.status(200).json({
      success: true,
      message: "Team and all associated data deleted permanently",
    });
  } catch (error) {
    console.error("Delete team error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting team",
      error: error.message,
    });
  }
};

/**
 * @desc    Get team members
 * @route   GET /api/teams/:teamId/members
 * @access  Private
 */
exports.getTeamMembers = async (req, res) => {
  try {
    const members = await TeamMember.find({
      team: req.params.teamId,
      status: "active",
    })
      .populate("user", "name email createdAt reportingManager")
      .populate("reportingManager", "name email")
      .populate("invitedBy", "name email")
      .sort("-joinedAt");

    res.status(200).json({
      success: true,
      count: members.length,
      data: members,
    });
  } catch (error) {
    console.error("Get team members error:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving team members",
      error: error.message,
    });
  }
};

/**
 * @desc    Get available users (users not in team)
 * @route   GET /api/teams/:teamId/available-users
 * @access  Private
 */
exports.getAvailableUsers = async (req, res) => {
  try {
    const teamId = req.params.teamId;

    // Get all current team member user IDs
    const teamMembers = await TeamMember.find({
      team: teamId,
      status: "active",
    }).select("user");

    const teamMemberIds = teamMembers.map((member) => member.user.toString());

    // Get all users who are not in this team
    const availableUsers = await User.find({
      _id: { $nin: teamMemberIds },
    })
      .select("name email")
      .sort("name");

    res.status(200).json({
      success: true,
      count: availableUsers.length,
      data: availableUsers,
    });
  } catch (error) {
    console.error("Get available users error:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving available users",
      error: error.message,
    });
  }
};

/**
 * @desc    Add member to team (in-app invitation)
 * @route   POST /api/teams/:teamId/members
 * @access  Private (Admin/Manager)
 */
exports.addTeamMember = async (req, res) => {
  try {
    const { userId, email, role, customTitle, reportingManagerId } = req.body;
    const teamId = req.params.teamId;

    // Find user by userId or email
    let user;
    if (userId) {
      user = await User.findById(userId);
    } else if (email) {
      user = await User.findOne({ email: email.toLowerCase() });
    } else {
      return res.status(400).json({
        success: false,
        message: "User ID or email is required",
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if user is already a member
    const existingMember = await TeamMember.findOne({
      team: teamId,
      user: user._id,
    });

    if (existingMember) {
      if (existingMember.status === "active") {
        return res.status(400).json({
          success: false,
          message: "User is already a member of this team",
        });
      } else {
        // Reactivate membership
        existingMember.status = "active";
        existingMember.role = role || "member";
        existingMember.customTitle = customTitle;
        if (reportingManagerId !== undefined) {
          existingMember.reportingManager = reportingManagerId || null;
        }
        existingMember.invitedBy = req.user._id;
        existingMember.joinedAt = new Date();
        await existingMember.save();

        if (reportingManagerId !== undefined) {
          user.reportingManager = reportingManagerId || null;
        }
        if (role) {
          user.role = role === "admin" ? "admin" : "user";
        }
        if (reportingManagerId !== undefined || role) {
          await user.save();
        }

        return res.status(200).json({
          success: true,
          data: existingMember,
          message: "User added to team successfully",
        });
      }
    }

    // Create new team membership
    const member = await TeamMember.create({
      team: teamId,
      user: user._id,
      role: role || "member",
      status: "active",
      customTitle,
      reportingManager: reportingManagerId || null,
      invitedBy: req.user._id,
      joinedAt: new Date(),
    });

    if (reportingManagerId !== undefined) {
      user.reportingManager = reportingManagerId || null;
    }
    if (role) {
      user.role = role === "admin" ? "admin" : "user";
    }
    if (reportingManagerId !== undefined || role) {
      await user.save();
    }

    // Populate user data
    await member.populate("user", "name email");
    await member.populate("reportingManager", "name email");

    res.status(201).json({
      success: true,
      data: member,
      message: "Member added successfully",
    });
  } catch (error) {
    console.error("Add team member error:", error);
    res.status(500).json({
      success: false,
      message: "Error adding team member",
      error: error.message,
    });
  }
};

/**
 * @desc    Update team member role
 * @route   PUT /api/teams/:teamId/members/:userId
 * @access  Private (Admin only)
 */
exports.updateTeamMember = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role, customTitle, reportingManagerId } = req.body;

    // Find membership
    const member = await TeamMember.findOne({
      team: req.params.teamId,
      user: userId,
    }).populate("user", "name email");

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Team member not found",
      });
    }

    // Prevent owner from being downgraded (unless by themselves)
    if (
      member.user._id.toString() === req.team.owner.toString() &&
      req.user._id.toString() !== req.team.owner.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Cannot modify team owner membership",
      });
    }

    // Update role and custom title
    if (role) member.role = role;
    if (customTitle !== undefined) member.customTitle = customTitle;
    if (reportingManagerId !== undefined) {
      member.reportingManager = reportingManagerId || null;
    }

    await member.save();

    const userUpdates = {};
    if (reportingManagerId !== undefined) {
      userUpdates.reportingManager = reportingManagerId || null;
    }
    if (role) {
      userUpdates.role = role === "admin" ? "admin" : "user";
    }
    if (Object.keys(userUpdates).length > 0) {
      await User.updateOne({ _id: member.user._id }, userUpdates);
    }

    res.status(200).json({
      success: true,
      data: member,
      message: "Member updated successfully",
    });
  } catch (error) {
    console.error("Update team member error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating team member",
      error: error.message,
    });
  }
};

/**
 * @desc    Remove member from team
 * @route   DELETE /api/teams/:teamId/members/:userId
 * @access  Private (Admin only)
 */
exports.removeTeamMember = async (req, res) => {
  try {
    const { userId } = req.params;
    const teamId = req.params.teamId;

    // Find membership
    const member = await TeamMember.findOne({
      team: teamId,
      user: userId,
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Team member not found",
      });
    }

    // Prevent owner from being removed
    if (userId === req.team.owner.toString()) {
      return res.status(403).json({
        success: false,
        message: "Cannot remove team owner",
      });
    }

    // Import ProjectMember model
    const ProjectMember = require("../models/ProjectMember");
    const Project = require("../models/Project");

    // Get all projects in this team
    const projects = await Project.find({ team: teamId });
    const projectIds = projects.map(p => p._id);

    // Remove user from all project memberships in this team
    await ProjectMember.deleteMany({
      project: { $in: projectIds },
      user: userId,
    });

    // Hard delete: remove the team membership completely
    await member.deleteOne();

    res.status(200).json({
      success: true,
      message: "Member removed permanently from team",
    });
  } catch (error) {
    console.error("Remove team member error:", error);
    res.status(500).json({
      success: false,
      message: "Error removing team member",
      error: error.message,
    });
  }
};

/**
 * @desc    Get team settings
 * @route   GET /api/teams/:teamId/settings
 * @access  Private
 */
exports.getTeamSettings = async (req, res) => {
  try {
    const team = req.team;

    res.status(200).json({
      success: true,
      data: team.settings,
    });
  } catch (error) {
    console.error("Get team settings error:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving team settings",
      error: error.message,
    });
  }
};

/**
 * @desc    Update team settings
 * @route   PUT /api/teams/:teamId/settings
 * @access  Private (Admin only)
 */
exports.updateTeamSettings = async (req, res) => {
  try {
    const team = req.team;
    const { timezone, workingHours, defaultSprintDuration } = req.body;

    // Update settings
    if (timezone) team.settings.timezone = timezone;
    if (workingHours) team.settings.workingHours = workingHours;
    if (defaultSprintDuration)
      team.settings.defaultSprintDuration = defaultSprintDuration;

    await team.save();

    res.status(200).json({
      success: true,
      data: team.settings,
      message: "Settings updated successfully",
    });
  } catch (error) {
    console.error("Update team settings error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating team settings",
      error: error.message,
    });
  }
};
