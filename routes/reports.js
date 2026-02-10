const express = require("express");
const router = express.Router({ mergeParams: true });
const { protect } = require("../middleware/auth");
const { setTeamContext, requireTeamAdmin } = require("../middleware/teamContext");
const reportController = require("../controllers/reportController");

// All routes require authentication and team context
router.use(protect);

// Team-level report routes
router.get(
  "/teams/:teamId/reports/team-info",
  setTeamContext,
  requireTeamAdmin,
  reportController.downloadTeamInfo
);

router.get(
  "/teams/:teamId/reports/activity",
  setTeamContext,
  reportController.downloadActivityReport
);

router.get(
  "/teams/:teamId/reports/my-activity",
  setTeamContext,
  reportController.downloadMyActivity
);

router.get(
  "/teams/:teamId/reports/bandwidth",
  setTeamContext,
  reportController.downloadBandwidthReport
);

router.get(
  "/teams/:teamId/reports/team-activity-summary",
  setTeamContext,
  reportController.downloadTeamActivitySummary
);

router.get(
  "/teams/:teamId/reports/projects",
  setTeamContext,
  reportController.downloadProjectReport
);

// Project-level report routes
router.get(
  "/teams/:teamId/projects/:projectId/reports/sprints",
  setTeamContext,
  reportController.downloadSprintReport
);

router.get(
  "/teams/:teamId/projects/:projectId/reports/tasks",
  setTeamContext,
  reportController.downloadProjectTasks
);

router.get(
  "/teams/:teamId/projects/:projectId/sprints/:sprintId/reports/tasks",
  setTeamContext,
  reportController.downloadSprintTasks
);

module.exports = router;
