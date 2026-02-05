const ProjectMember = require("../models/ProjectMember");
const Project = require("../models/Project");

// Team role definitions
const TEAM_ROLES = {
  ADMIN: "admin",
  Manager: "Manager",
  MEMBER: "member",
  VIEWER: "viewer",
};

// Project role definitions
const PROJECT_ROLES = {
  OWNER: "owner",
  MANAGER: "manager",
  CONTRIBUTOR: "contributor",
  VIEWER: "viewer",
};

// Team-level permissions matrix
const TEAM_PERMISSIONS = {
  // Team Management
  MANAGE_TEAM: ["admin"],
  INVITE_MEMBERS: ["admin", "Manager"],
  REMOVE_MEMBERS: ["admin"],

  // Project Management
  CREATE_PROJECTS: ["admin", "Manager"],
  VIEW_ALL_PROJECTS: ["admin", "Manager"],
  DELETE_PROJECTS: ["admin"],

  // Reports & Analytics
  VIEW_TEAM_REPORTS: ["admin", "Manager"],
  VIEW_REPORTS: ["admin", "Manager"],
  APPROVE_BANDWIDTH: ["admin", "Manager"],
  VIEW_ALL_ACTIVITIES: ["admin"],

  // Settings
  MANAGE_SETTINGS: ["admin"],
};

// Project-level permissions matrix
const PROJECT_PERMISSIONS = {
  // Project
  EDIT_PROJECT: ["owner", "manager"],
  DELETE_PROJECT: ["owner"],
  ARCHIVE_PROJECT: ["owner", "manager"],

  // Members
  INVITE_MEMBERS: ["owner", "manager"],
  REMOVE_MEMBERS: ["owner", "manager"],
  ASSIGN_TASKS: ["owner", "manager", "contributor"],

  // Sprints
  CREATE_SPRINT: ["owner", "manager"],
  START_SPRINT: ["owner", "manager"],
  COMPLETE_SPRINT: ["owner", "manager"],
  EDIT_SPRINT: ["owner", "manager"],

  // Tasks
  CREATE_TASK: ["owner", "manager", "contributor"],
  EDIT_OWN_TASK: ["owner", "manager", "contributor"],
  EDIT_ANY_TASK: ["owner", "manager"],
  DELETE_TASK: ["owner", "manager"],

  // Viewing
  VIEW_PROJECT: ["owner", "manager", "contributor", "viewer"],
  VIEW_SPRINT: ["owner", "manager", "contributor", "viewer"],
};

/**
 * Check if user has team-level permission
 */
function checkTeamPermission(teamMembership, permission) {
  if (!teamMembership) {
    return false;
  }

  const allowedRoles = TEAM_PERMISSIONS[permission] || [];
  return allowedRoles.includes(teamMembership.role);
}

/**
 * Check if user has project-level permission
 */
function checkProjectPermission(teamMembership, projectMembership, permission) {
  // Team admins have all permissions
  if (teamMembership && teamMembership.role === "admin") {
    return true;
  }

  // Check project-specific permission
  if (!projectMembership) {
    return false;
  }

  const allowedRoles = PROJECT_PERMISSIONS[permission] || [];
  return allowedRoles.includes(projectMembership.role);
}

/**
 * Middleware to check team permission
 */
const requireTeamPermission = (permission) => {
  return async (req, res, next) => {
    try {
      if (!req.teamMembership) {
        return res.status(403).json({
          success: false,
          message: "Team membership not found",
        });
      }

      const hasPermission = checkTeamPermission(req.teamMembership, permission);

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: `Insufficient permissions. Required permission: ${permission}`,
        });
      }

      next();
    } catch (error) {
      console.error("Team permission check error:", error);
      return res.status(500).json({
        success: false,
        message: "Error checking permissions",
        error: error.message,
      });
    }
  };
};

/**
 * Middleware to check project permission
 */
const requireProjectPermission = (permission) => {
  return async (req, res, next) => {
    try {
      if (!req.teamMembership) {
        return res.status(403).json({
          success: false,
          message: "Team membership not found",
        });
      }

      // Support both :id and :projectId parameter names
      const projectId = req.params.projectId || req.params.id;

      if (!projectId) {
        return res.status(400).json({
          success: false,
          message: "Project ID is required",
        });
      }

      // Team lead can manage membership for their project (even without ProjectMember entry)
      if (permission === "INVITE_MEMBERS" || permission === "REMOVE_MEMBERS") {
        const project = await Project.findById(projectId).select("teamLead");
        if (
          project?.teamLead &&
          project.teamLead.toString() === req.user._id.toString()
        ) {
          return next();
        }
      }

      // Find project membership
      const projectMembership = await ProjectMember.findOne({
        project: projectId,
        user: req.user._id,
      });

      // Check permission
      const hasPermission = checkProjectPermission(
        req.teamMembership,
        projectMembership,
        permission,
      );

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: `Insufficient permissions. Required permission: ${permission}`,
        });
      }

      // Attach to request for use in controllers
      req.projectMembership = projectMembership;

      next();
    } catch (error) {
      console.error("Project permission check error:", error);
      return res.status(500).json({
        success: false,
        message: "Error checking permissions",
        error: error.message,
      });
    }
  };
};

/**
 * Middleware to check sprint access
 */
const requireSprintAccess = async (req, res, next) => {
  try {
    const Sprint = require("../models/Sprint");
    const sprintId = req.params.sprintId;

    if (!sprintId) {
      return res.status(400).json({
        success: false,
        message: "Sprint ID is required",
      });
    }

    const sprint = await Sprint.findById(sprintId);

    if (!sprint) {
      return res.status(404).json({
        success: false,
        message: "Sprint not found",
      });
    }

    // Check if user has access to sprint's project
    const projectMembership = await ProjectMember.findOne({
      project: sprint.project,
      user: req.user._id,
    });

    const hasAccess = checkProjectPermission(
      req.teamMembership,
      projectMembership,
      "VIEW_SPRINT",
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this sprint",
      });
    }

    // Attach to request
    req.sprint = sprint;
    req.projectMembership = projectMembership;

    next();
  } catch (error) {
    console.error("Sprint access check error:", error);
    return res.status(500).json({
      success: false,
      message: "Error checking sprint access",
      error: error.message,
    });
  }
};

module.exports = {
  TEAM_ROLES,
  PROJECT_ROLES,
  TEAM_PERMISSIONS,
  PROJECT_PERMISSIONS,
  checkTeamPermission,
  checkProjectPermission,
  requireTeamPermission,
  requireProjectPermission,
  requireSprintAccess,
};
