const User = require("../models/User");
const Team = require("../models/Team");
const TeamMember = require("../models/TeamMember");
const Project = require("../models/Project");
const ProjectMember = require("../models/ProjectMember");
const Task = require("../models/Tasks");
const Sprint = require("../models/Sprint");
const Activity = require("../models/Activity");
const BandwidthReport = require("../models/BandwidthReport");
const { generateReport, formatDate, formatDuration } = require("../utils/reportGenerator");

/**
 * Helper to get scoped user IDs based on role
 */
const getScopedUserIds = async (teamId, requester, role) => {
  // Admin sees all
  if (role === "admin") {
    const allMembers = await TeamMember.find({
      team: teamId,
      status: "active",
    }).select("user");
    return allMembers.map((m) => m.user.toString());
  }

  // Manager sees direct reports
  if (role === "Manager" || role === "project_manager") {
    const directReports = await TeamMember.find({
      team: teamId,
      status: "active",
      reportingManager: requester._id,
    }).select("user");
    const directReportIds = directReports.map((m) => m.user.toString());
    return [requester._id.toString(), ...directReportIds];
  }

  // Others see only themselves
  return [requester._id.toString()];
};

/**
 * @desc    Download team info report
 * @route   GET /api/teams/:teamId/reports/team-info
 * @access  Private (Admin/Manager)
 */
exports.downloadTeamInfo = async (req, res) => {
  try {
    const { teamId } = req.params;
    const role = req.teamMembership?.role;

    // Only admins can download full team info
    if (role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can download team info report",
      });
    }

    const members = await TeamMember.find({
      team: teamId,
      status: "active",
    })
      .populate("user", "name email")
      .populate("reportingManager", "name email")
      .sort("user.name");

    const data = members.map((m) => ({
      ...m.toObject(),
      joinedAt: formatDate(m.joinedAt),
    }));

    const team = await Team.findById(teamId);
    const report = generateReport("teamInfo", data, {
      filename: `${team.name}_team_info_${new Date().toISOString().split("T")[0]}`,
    });

    res.setHeader("Content-Type", report.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    res.send(report.content);
  } catch (error) {
    console.error("Download team info error:", error);
    res.status(500).json({
      success: false,
      message: "Error generating team info report",
      error: error.message,
    });
  }
};

/**
 * @desc    Download activity report
 * @route   GET /api/teams/:teamId/reports/activity
 * @access  Private
 */
exports.downloadActivityReport = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { startDate, endDate, userId, period = "daily" } = req.query;
    const role = req.teamMembership?.role;

    // Get scoped user IDs
    const scopedUserIds = await getScopedUserIds(teamId, req.user, role);

    // Build date range
    let rangeStart, rangeEnd;
    if (startDate && endDate) {
      rangeStart = new Date(startDate);
      rangeEnd = new Date(endDate);
    } else {
      rangeEnd = new Date();
      rangeStart = new Date();
      switch (period) {
        case "weekly":
          rangeStart.setDate(rangeStart.getDate() - 7);
          break;
        case "monthly":
          rangeStart.setMonth(rangeStart.getMonth() - 1);
          break;
        case "yearly":
          rangeStart.setFullYear(rangeStart.getFullYear() - 1);
          break;
        default:
          rangeStart.setDate(rangeStart.getDate() - 1);
      }
    }

    // Build query
    const query = {
      date: { $gte: rangeStart, $lte: rangeEnd },
    };

    // If specific user requested and viewer has permission
    if (userId) {
      if (!scopedUserIds.includes(userId) && role !== "admin") {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to view this user's activity",
        });
      }
      query.user = userId;
    } else {
      query.user = { $in: scopedUserIds };
    }

    const activities = await Activity.find(query)
      .populate("user", "name email")
      .sort({ date: -1, "user.name": 1 });

    // Process activities
    const data = activities.map((a) => {
      const actObj = a.toObject();
      return {
        date: formatDate(actObj.date),
        user: actObj.user,
        totalHours: formatDuration(actObj.totalHours || 0),
        productivity: actObj.productivity || 0,
        mood: actObj.mood || "N/A",
        notes: actObj.notes || "",
        tasks: (actObj.tasks || []).length,
      };
    });

    const report = generateReport("dailyActivity", data, {
      filename: `activity_report_${period}_${new Date().toISOString().split("T")[0]}`,
    });

    res.setHeader("Content-Type", report.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    res.send(report.content);
  } catch (error) {
    console.error("Download activity report error:", error);
    res.status(500).json({
      success: false,
      message: "Error generating activity report",
      error: error.message,
    });
  }
};

/**
 * @desc    Download my activity report
 * @route   GET /api/teams/:teamId/reports/my-activity
 * @access  Private
 */
exports.downloadMyActivity = async (req, res) => {
  try {
    const { startDate, endDate, period = "monthly" } = req.query;

    // Build date range
    let rangeStart, rangeEnd;
    if (startDate && endDate) {
      rangeStart = new Date(startDate);
      rangeEnd = new Date(endDate);
    } else {
      rangeEnd = new Date();
      rangeStart = new Date();
      switch (period) {
        case "weekly":
          rangeStart.setDate(rangeStart.getDate() - 7);
          break;
        case "yearly":
          rangeStart.setFullYear(rangeStart.getFullYear() - 1);
          break;
        default:
          rangeStart.setMonth(rangeStart.getMonth() - 1);
      }
    }

    const activities = await Activity.find({
      user: req.user._id,
      date: { $gte: rangeStart, $lte: rangeEnd },
    })
      .populate("user", "name email")
      .sort({ date: -1 });

    const data = activities.map((a) => {
      const actObj = a.toObject();
      return {
        date: formatDate(actObj.date),
        user: actObj.user,
        totalHours: formatDuration(actObj.totalHours || 0),
        productivity: actObj.productivity || 0,
        mood: actObj.mood || "N/A",
        notes: actObj.notes || "",
        tasks: (actObj.tasks || []).length,
      };
    });

    const report = generateReport("dailyActivity", data, {
      filename: `my_activity_${period}_${new Date().toISOString().split("T")[0]}`,
    });

    res.setHeader("Content-Type", report.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    res.send(report.content);
  } catch (error) {
    console.error("Download my activity error:", error);
    res.status(500).json({
      success: false,
      message: "Error generating activity report",
      error: error.message,
    });
  }
};

/**
 * @desc    Download bandwidth report
 * @route   GET /api/teams/:teamId/reports/bandwidth
 * @access  Private (Admin/Manager)
 */
exports.downloadBandwidthReport = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { month, year, userId, status } = req.query;
    const role = req.teamMembership?.role;

    // Get scoped user IDs
    const scopedUserIds = await getScopedUserIds(teamId, req.user, role);

    // Build query
    const query = { team: teamId };

    if (month) query.month = parseInt(month);
    if (year) query.year = parseInt(year);
    if (status) query.status = status;

    // Scope users based on role
    if (userId) {
      if (!scopedUserIds.includes(userId) && role !== "admin") {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to view this user's bandwidth",
        });
      }
      query.user = userId;
    } else if (role !== "admin") {
      query.user = { $in: scopedUserIds };
    }

    const reports = await BandwidthReport.find(query)
      .populate("user", "name email")
      .sort({ year: -1, month: -1, "user.name": 1 });

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    const data = reports.map((r) => ({
      ...r.toObject(),
      month: monthNames[r.month - 1],
    }));

    const report = generateReport("bandwidth", data, {
      filename: `bandwidth_report_${year || "all"}_${month || "all"}_${new Date().toISOString().split("T")[0]}`,
    });

    res.setHeader("Content-Type", report.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    res.send(report.content);
  } catch (error) {
    console.error("Download bandwidth report error:", error);
    res.status(500).json({
      success: false,
      message: "Error generating bandwidth report",
      error: error.message,
    });
  }
};

/**
 * @desc    Download team activity summary
 * @route   GET /api/teams/:teamId/reports/team-activity-summary
 * @access  Private (Admin/Manager)
 */
exports.downloadTeamActivitySummary = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { startDate, endDate, period = "monthly" } = req.query;
    const role = req.teamMembership?.role;

    // Get scoped user IDs
    const scopedUserIds = await getScopedUserIds(teamId, req.user, role);

    // Build date range
    let rangeStart, rangeEnd;
    if (startDate && endDate) {
      rangeStart = new Date(startDate);
      rangeEnd = new Date(endDate);
    } else {
      rangeEnd = new Date();
      rangeStart = new Date();
      switch (period) {
        case "weekly":
          rangeStart.setDate(rangeStart.getDate() - 7);
          break;
        case "yearly":
          rangeStart.setFullYear(rangeStart.getFullYear() - 1);
          break;
        default:
          rangeStart.setMonth(rangeStart.getMonth() - 1);
      }
    }

    // Get users
    const members = await TeamMember.find({
      team: teamId,
      user: { $in: scopedUserIds },
      status: "active",
    }).populate("user", "name email");

    // Get activity summary for each user
    const summaryData = await Promise.all(
      members.map(async (member) => {
        const userId = member.user._id;

        // Get activities
        const activities = await Activity.find({
          user: userId,
          date: { $gte: rangeStart, $lte: rangeEnd },
        });

        // Get tasks completed
        const tasksCompleted = await Task.countDocuments({
          assignedTo: userId,
          completedAt: { $gte: rangeStart, $lte: rangeEnd },
          status: { $in: ["completed", "done"] },
        });

        // Calculate totals
        const totalHours = activities.reduce((sum, a) => sum + (a.totalHours || 0), 0);
        const totalProductivity = activities.reduce((sum, a) => sum + (a.productivity || 0), 0);
        const avgProductivity = activities.length > 0
          ? (totalProductivity / activities.length).toFixed(1)
          : 0;

        return {
          user: member.user,
          totalActivities: activities.length,
          totalHours: formatDuration(totalHours),
          avgProductivity,
          tasksCompleted,
          activeDays: activities.length,
        };
      })
    );

    const report = generateReport("teamActivity", summaryData, {
      filename: `team_activity_summary_${period}_${new Date().toISOString().split("T")[0]}`,
    });

    res.setHeader("Content-Type", report.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    res.send(report.content);
  } catch (error) {
    console.error("Download team activity summary error:", error);
    res.status(500).json({
      success: false,
      message: "Error generating team activity summary",
      error: error.message,
    });
  }
};

/**
 * @desc    Download project report
 * @route   GET /api/teams/:teamId/reports/projects
 * @access  Private
 */
exports.downloadProjectReport = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { projectId } = req.query;
    const role = req.teamMembership?.role;

    // Build query
    const query = { team: teamId, isArchived: false };

    // Non-admins can only see projects they lead or are members of
    if (role !== "admin") {
      const memberProjects = await ProjectMember.find({
        user: req.user._id,
      }).select("project");
      const memberProjectIds = memberProjects.map((p) => p.project);

      const leadProjects = await Project.find({
        team: teamId,
        teamLead: req.user._id,
      }).select("_id");
      const leadProjectIds = leadProjects.map((p) => p._id);

      const accessibleProjectIds = [...new Set([...memberProjectIds, ...leadProjectIds])];
      query._id = { $in: accessibleProjectIds };
    }

    if (projectId) {
      query._id = projectId;
    }

    const projects = await Project.find(query)
      .populate("teamLead", "name email")
      .populate("createdBy", "name email")
      .sort("name");

    // Get stats for each project
    const projectData = await Promise.all(
      projects.map(async (project) => {
        const memberCount = await ProjectMember.countDocuments({
          project: project._id,
        });
        const totalTasks = await Task.countDocuments({ project: project._id });
        const completedTasks = await Task.countDocuments({
          project: project._id,
          status: { $in: ["completed", "done"] },
        });

        return {
          ...project.toObject(),
          memberCount,
          totalTasks,
          completedTasks,
          completionRate: totalTasks > 0
            ? Math.round((completedTasks / totalTasks) * 100) + "%"
            : "0%",
          createdAt: formatDate(project.createdAt),
        };
      })
    );

    const report = generateReport("project", projectData, {
      filename: `project_report_${new Date().toISOString().split("T")[0]}`,
    });

    res.setHeader("Content-Type", report.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    res.send(report.content);
  } catch (error) {
    console.error("Download project report error:", error);
    res.status(500).json({
      success: false,
      message: "Error generating project report",
      error: error.message,
    });
  }
};

/**
 * @desc    Download sprint report
 * @route   GET /api/teams/:teamId/projects/:projectId/reports/sprints
 * @access  Private
 */
exports.downloadSprintReport = async (req, res) => {
  try {
    const { teamId, projectId } = req.params;
    const { sprintId, includeTaskDetails } = req.query;

    // Verify project access
    const project = await Project.findOne({
      _id: projectId,
      team: teamId,
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Build query
    const query = { project: projectId };
    if (sprintId) {
      query._id = sprintId;
    }

    const sprints = await Sprint.find(query)
      .populate("project", "name")
      .sort({ startDate: -1 });

    // Get stats for each sprint
    const sprintData = await Promise.all(
      sprints.map(async (sprint) => {
        const totalTasks = await Task.countDocuments({ sprint: sprint._id });
        const completedTasks = await Task.countDocuments({
          sprint: sprint._id,
          status: { $in: ["completed", "done"] },
        });

        // Calculate story points
        const tasks = await Task.find({ sprint: sprint._id }).select("storyPoints status");
        const totalStoryPoints = tasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
        const completedStoryPoints = tasks
          .filter((t) => ["completed", "done"].includes(t.status))
          .reduce((sum, t) => sum + (t.storyPoints || 0), 0);

        return {
          ...sprint.toObject(),
          startDate: formatDate(sprint.startDate),
          endDate: formatDate(sprint.endDate),
          totalTasks,
          completedTasks,
          totalStoryPoints,
          completedStoryPoints,
          velocity: sprint.metrics?.velocity || completedStoryPoints,
        };
      })
    );

    const report = generateReport("sprint", sprintData, {
      filename: `${project.name}_sprint_report_${new Date().toISOString().split("T")[0]}`,
    });

    res.setHeader("Content-Type", report.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    res.send(report.content);
  } catch (error) {
    console.error("Download sprint report error:", error);
    res.status(500).json({
      success: false,
      message: "Error generating sprint report",
      error: error.message,
    });
  }
};

/**
 * @desc    Download sprint tasks report
 * @route   GET /api/teams/:teamId/projects/:projectId/sprints/:sprintId/reports/tasks
 * @access  Private
 */
exports.downloadSprintTasks = async (req, res) => {
  try {
    const { teamId, projectId, sprintId } = req.params;

    // Verify sprint access
    const sprint = await Sprint.findOne({
      _id: sprintId,
      project: projectId,
    }).populate("project", "name");

    if (!sprint) {
      return res.status(404).json({
        success: false,
        message: "Sprint not found",
      });
    }

    const tasks = await Task.find({ sprint: sprintId })
      .populate("assignedTo", "name email")
      .populate("sprint", "name")
      .sort({ status: 1, priority: -1 });

    const taskData = tasks.map((t) => ({
      ...t.toObject(),
      dueDate: formatDate(t.dueDate),
      completedAt: formatDate(t.completedAt),
      createdAt: formatDate(t.createdAt),
    }));

    const report = generateReport("tasks", taskData, {
      filename: `${sprint.project.name}_${sprint.name}_tasks_${new Date().toISOString().split("T")[0]}`,
    });

    res.setHeader("Content-Type", report.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    res.send(report.content);
  } catch (error) {
    console.error("Download sprint tasks error:", error);
    res.status(500).json({
      success: false,
      message: "Error generating sprint tasks report",
      error: error.message,
    });
  }
};

/**
 * @desc    Download project tasks report (all tasks or backlog)
 * @route   GET /api/teams/:teamId/projects/:projectId/reports/tasks
 * @access  Private
 */
exports.downloadProjectTasks = async (req, res) => {
  try {
    const { teamId, projectId } = req.params;
    const { backlogOnly } = req.query;

    // Verify project access
    const project = await Project.findOne({
      _id: projectId,
      team: teamId,
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Build query
    const query = { project: projectId };
    if (backlogOnly === "true") {
      query.sprint = null;
    }

    const tasks = await Task.find(query)
      .populate("assignedTo", "name email")
      .populate("sprint", "name")
      .sort({ status: 1, priority: -1, createdAt: -1 });

    const taskData = tasks.map((t) => ({
      ...t.toObject(),
      dueDate: formatDate(t.dueDate),
      completedAt: formatDate(t.completedAt),
      createdAt: formatDate(t.createdAt),
    }));

    const filename = backlogOnly === "true"
      ? `${project.name}_backlog_${new Date().toISOString().split("T")[0]}`
      : `${project.name}_all_tasks_${new Date().toISOString().split("T")[0]}`;

    const report = generateReport("tasks", taskData, { filename });

    res.setHeader("Content-Type", report.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    res.send(report.content);
  } catch (error) {
    console.error("Download project tasks error:", error);
    res.status(500).json({
      success: false,
      message: "Error generating project tasks report",
      error: error.message,
    });
  }
};
