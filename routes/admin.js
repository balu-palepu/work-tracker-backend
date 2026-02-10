const express = require("express");
const router = express.Router({ mergeParams: true });
const { protect } = require("../middleware/auth");
const { setTeamContext } = require("../middleware/teamContext");
const { requireTeamPermission } = require("../middleware/permissions");
const Project = require("../models/Project");
const TeamMember = require("../models/TeamMember");
const {
  getDashboard,
  getTeamMembers,
  getProjectStats,
  getActivityFeed,
  getTeamAnalytics,
  getProjectManagerView,
  updateMemberRole,
  removeMember,
  unlockAccount,
  getLockedAccounts,
  getTeamHistory,
  getTeamStatistics,
  getMemberComparison,
} = require("../controllers/adminController");
const {
  assignTeamLead,
  getProjectsByTeamLead,
} = require("../controllers/projectController");

// All routes require authentication, team context, and admin/manager permissions
router.use(protect);
router.use(setTeamContext);

const allowScopedAccess = async (req, res, next) => {
  try {
    const role = req.teamMembership?.role;
    if (role === "admin" || role === "project_manager" || role === "Manager") {
      return next();
    }

    const isTeamLead = await Project.exists({
      team: req.params.teamId,
      teamLead: req.user._id,
    });

    if (isTeamLead) {
      return next();
    }

    const isReportingManager = await TeamMember.exists({
      team: req.params.teamId,
      reportingManager: req.user._id,
      status: "active",
    });

    if (isReportingManager) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: "Insufficient permissions",
    });
  } catch (error) {
    console.error("Team lead permission check error:", error);
    return res.status(500).json({
      success: false,
      message: "Error checking permissions",
      error: error.message,
    });
  }
};

// Dashboard and analytics
router.get("/dashboard", allowScopedAccess, getDashboard);
router.get("/project-manager-view", allowScopedAccess, getProjectManagerView);
router.get(
  "/analytics",
  requireTeamPermission("MANAGE_TEAM"),
  getTeamAnalytics,
);

// Team management
router.get("/members", allowScopedAccess, getTeamMembers);
router.put(
  "/members/:userId/role",
  requireTeamPermission("MANAGE_TEAM"),
  updateMemberRole,
);
router.delete(
  "/members/:userId",
  requireTeamPermission("MANAGE_TEAM"),
  removeMember,
);
router.put(
  "/members/:userId/unlock",
  requireTeamPermission("MANAGE_TEAM"),
  unlockAccount,
);

// Locked accounts
router.get(
  "/locked-accounts",
  requireTeamPermission("MANAGE_TEAM"),
  getLockedAccounts,
);

// Project stats
router.get("/projects", requireTeamPermission("MANAGE_TEAM"), getProjectStats);

// Activity feed
router.get("/activity", allowScopedAccess, getActivityFeed);

// Team history and statistics (for admin/manager)
router.get("/history", allowScopedAccess, getTeamHistory);
router.get("/statistics", allowScopedAccess, getTeamStatistics);
router.get("/comparison", allowScopedAccess, getMemberComparison);

// Team lead management
router.put("/projects/:projectId/team-lead", assignTeamLead);
router.get("/projects/team-lead/:userId", getProjectsByTeamLead);

module.exports = router;
