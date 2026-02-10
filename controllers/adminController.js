const User = require("../models/User");
const Team = require("../models/Team");
const TeamMember = require("../models/TeamMember");
const Project = require("../models/Project");
const Task = require("../models/Tasks");
const Sprint = require("../models/Sprint");
const Activity = require("../models/Activity");
const BandwidthReport = require("../models/BandwidthReport");
const ProjectMember = require("../models/ProjectMember");
const { maskEmail, canViewFullEmail } = require("../utils/emailSecurity");

const isAdminOrProjectManager = (role) =>
  role === "admin" || role === "project_manager";

const getScopedUserIds = async (teamId, requester, role) => {
  if (isAdminOrProjectManager(role)) {
    const allMembers = await TeamMember.find({
      team: teamId,
      status: "active",
    }).select("user");
    return allMembers.map((m) => m.user.toString());
  }

  const directReports = await TeamMember.find({
    team: teamId,
    status: "active",
    reportingManager: requester._id,
  }).select("user");

  const directReportIds = directReports.map((m) => m.user.toString());
  const scopedSet = new Set([requester._id.toString(), ...directReportIds]);

  return Array.from(scopedSet);
};

/**
 * @desc    Get admin dashboard overview
 * @route   GET /api/teams/:teamId/admin/dashboard
 * @access  Private (Admin)
 */
exports.getDashboard = async (req, res) => {
  try {
    const { teamId } = req.params;
    const role = req.teamMembership?.role;
    const scopedUserIds = await getScopedUserIds(teamId, req.user, role);

    // Get team stats
    const totalMembers =
      isAdminOrProjectManager(role)
        ? await TeamMember.countDocuments({ team: teamId, status: "active" })
        : Math.max(0, scopedUserIds.length - 1);

    const totalProjects =
      isAdminOrProjectManager(role)
        ? await Project.countDocuments({ team: teamId, isArchived: false })
        : await Project.countDocuments({
            team: teamId,
            teamLead: req.user._id,
            isArchived: false,
          });

    const sprintProjectIds =
      isAdminOrProjectManager(role)
        ? await Project.find({ team: teamId, isArchived: false }).select("_id")
        : await Project.find({
            team: teamId,
            teamLead: req.user._id,
            isArchived: false,
          }).select("_id");

    const activeSprints =
      sprintProjectIds.length === 0
        ? 0
        : await Sprint.countDocuments({
            project: { $in: sprintProjectIds.map((p) => p._id) },
            status: { $in: ["active", "running"] },
          });

    const totalTasks = await Task.countDocuments({
      assignedTo: { $in: scopedUserIds },
    });
    const completedTasks = await Task.countDocuments({
      assignedTo: { $in: scopedUserIds },
      status: { $in: ["completed", "done"] },
    });

    // Get pending approvals
    const pendingBandwidth = await BandwidthReport.countDocuments({
      team: teamId,
      status: "submitted",
    });

    // Get recent activities (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentActivities = await Activity.countDocuments({
      user: { $in: scopedUserIds },
      date: { $gte: sevenDaysAgo },
    });

    // Calculate completion rate
    const completionRate =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Get project health (projects with active sprints)
    const projects =
      isAdminOrProjectManager(role)
        ? await Project.find({ team: teamId, isArchived: false })
        : await Project.find({
            team: teamId,
            teamLead: req.user._id,
            isArchived: false,
          })
            .populate("currentSprint", "status progress")
            .select("name currentSprint");

    const projectHealth = projects.map((project) => ({
      id: project._id,
      name: project.name,
      hasActiveSprint: !!project.currentSprint,
      progress: project.currentSprint?.progress || 0,
    }));

    res.json({
      success: true,
      data: {
        stats: {
          totalMembers,
          totalProjects,
          activeSprints,
          totalTasks,
          completedTasks,
          completionRate,
          pendingBandwidth,
          recentActivities,
        },
        projectHealth,
      },
    });
  } catch (error) {
    console.error("Get dashboard error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching dashboard data",
      error: error.message,
    });
  }
};

/**
 * @desc    Get team members with stats
 * @route   GET /api/teams/:teamId/admin/members
 * @access  Private (Admin)
 */
exports.getTeamMembers = async (req, res) => {
  try {
    const { teamId } = req.params;
    const {
      page = 1,
      limit = 10,
      sortBy = "joinedAt",
      sortOrder = "desc",
      search = "",
    } = req.query;
    const role = req.teamMembership?.role;
    const scopedUserIds = await getScopedUserIds(teamId, req.user, role);

    const membersQuery =
      isAdminOrProjectManager(role)
        ? { team: teamId }
        : { team: teamId, user: { $in: scopedUserIds } };

    // Get total count for pagination
    const totalCount = await TeamMember.countDocuments(membersQuery);

    // Build sort object
    const sortObj = {};
    if (sortBy === "name") {
      sortObj["user.name"] = sortOrder === "asc" ? 1 : -1;
    } else if (sortBy === "email") {
      sortObj["user.email"] = sortOrder === "asc" ? 1 : -1;
    } else if (sortBy === "role") {
      sortObj["role"] = sortOrder === "asc" ? 1 : -1;
    } else {
      sortObj[sortBy] = sortOrder === "asc" ? 1 : -1;
    }

    // Fetch members with pagination
    const members = await TeamMember.find(membersQuery)
      .populate("user", "name email createdAt reportingManager loginAttempts lockUntil")
      .populate("reportingManager", "name email")
      .sort(sortObj)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Filter by search if provided
    let filteredMembers = members;
    if (search) {
      filteredMembers = members.filter(
        (member) =>
          member.user?.name?.toLowerCase().includes(search.toLowerCase()) ||
          member.user?.email?.toLowerCase().includes(search.toLowerCase()) ||
          member.role?.toLowerCase().includes(search.toLowerCase()),
      );
    }

    // Get stats for each member
    const membersWithStats = await Promise.all(
      filteredMembers.map(async (member) => {
        const userId = member.user._id;

        // Get task stats
        const assignedTasks = await Task.countDocuments({
          team: teamId,
          assignedTo: userId,
        });
        const completedTasks = await Task.countDocuments({
          team: teamId,
          assignedTo: userId,
          status: { $in: ["completed", "done"] },
        });

        // Get latest bandwidth report
        const latestBandwidth = await BandwidthReport.findOne({
          team: teamId,
          user: userId,
          status: { $in: ["approved", "submitted", "draft"] },
        }).sort({ year: -1, month: -1 });

        // Get activities count (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentActivities = await Activity.countDocuments({
          user: userId,
          date: { $gte: thirtyDaysAgo },
        });

        const memberObj = member.toObject();

        // Mask emails for non-admin users
        if (role !== 'admin' && memberObj.user && memberObj.user.email) {
          if (!canViewFullEmail(req.user._id.toString(), memberObj.user._id, role)) {
            memberObj.user.email = maskEmail(memberObj.user.email);
            memberObj.user.emailMasked = true;
          }
        }

        if (role !== 'admin' && memberObj.reportingManager && memberObj.reportingManager.email) {
          memberObj.reportingManager.email = maskEmail(memberObj.reportingManager.email);
        }

        // Get lock status (only for admins)
        const lockStatus = role === 'admin' && member.user ? {
          isLocked: member.user.lockUntil && member.user.lockUntil > Date.now(),
          loginAttempts: member.user.loginAttempts || 0,
          lockUntil: member.user.lockUntil,
          lockExpiresIn: member.user.lockUntil && member.user.lockUntil > Date.now()
            ? Math.max(0, Math.round((member.user.lockUntil - Date.now()) / 1000 / 60))
            : null, // Minutes remaining
        } : null;

        // Remove sensitive fields from user object
        if (memberObj.user) {
          delete memberObj.user.loginAttempts;
          delete memberObj.user.lockUntil;
        }

        return {
          ...memberObj,
          lockStatus,
          stats: {
            assignedTasks,
            completedTasks,
            completionRate:
              assignedTasks > 0
                ? Math.round((completedTasks / assignedTasks) * 100)
                : 0,
            recentActivities,
            latestBandwidth: latestBandwidth
              ? {
                  month: latestBandwidth.month,
                  year: latestBandwidth.year,
                  utilization: latestBandwidth.utilizationPercentage,
                }
              : null,
          },
        };
      }),
    );

    res.json({
      success: true,
      count: membersWithStats.length,
      total: totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / limit),
      data: membersWithStats,
    });
  } catch (error) {
    console.error("Get team members error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching team members",
      error: error.message,
    });
  }
};

/**
 * @desc    Get project statistics
 * @route   GET /api/teams/:teamId/admin/projects
 * @access  Private (Admin)
 */
exports.getProjectStats = async (req, res) => {
  try {
    const { teamId } = req.params;
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
      search = "",
    } = req.query;
    const role = req.teamMembership?.role;

    // Build query
    const query = { team: teamId, isArchived: false };
    if (!isAdminOrProjectManager(role)) {
      query.teamLead = req.user._id;
    }

    // Add search if provided
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    // Get total count
    const totalCount = await Project.countDocuments(query);

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === "asc" ? 1 : -1;

    const projects = await Project.find(query)
      .populate("createdBy", "name email")
      .populate("currentSprint", "name status progress")
      .populate("teamLead", "name email")
      .sort(sortObj)
      .skip((page - 1) * parseInt(limit))
      .limit(parseInt(limit));

    // Get stats for each project
    const projectStats = await Promise.all(
      projects.map(async (project) => {
        const totalTasks = await Task.countDocuments({ project: project._id });
        const completedTasks = await Task.countDocuments({
          project: project._id,
          status: "completed",
        });
        const memberCount = await ProjectMember.countDocuments({
          project: project._id,
        });
        const sprintCount = await Sprint.countDocuments({
          project: project._id,
        });
        const activeSprint = await Sprint.findOne({
          project: project._id,
          status: "active",
        });

        const projectObj = project.toObject();

        // Mask emails for non-admin users
        if (role !== 'admin') {
          if (projectObj.createdBy && projectObj.createdBy.email) {
            projectObj.createdBy.email = maskEmail(projectObj.createdBy.email);
          }
          if (projectObj.teamLead && projectObj.teamLead.email) {
            projectObj.teamLead.email = maskEmail(projectObj.teamLead.email);
          }
        }

        return {
          ...projectObj,
          stats: {
            totalTasks,
            completedTasks,
            completionRate:
              totalTasks > 0
                ? Math.round((completedTasks / totalTasks) * 100)
                : 0,
            memberCount,
            sprintCount,
            hasActiveSprint: !!activeSprint,
          },
        };
      }),
    );

    res.json({
      success: true,
      count: projectStats.length,
      total: totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      data: projectStats,
    });
  } catch (error) {
    console.error("Get project stats error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching project statistics",
      error: error.message,
    });
  }
};

/**
 * @desc    Get activity feed
 * @route   GET /api/teams/:teamId/admin/activity
 * @access  Private (Admin)
 */
exports.getActivityFeed = async (req, res) => {
  try {
    const { teamId } = req.params;
    const {
      page = 1,
      limit = 50,
      days = 30,
      startDate,
      endDate,
      userId,
      sortBy = "date",
      sortOrder = "desc",
    } = req.query;
    const role = req.teamMembership?.role;

    let rangeStart;
    let rangeEnd;

    if (startDate || endDate) {
      rangeStart = startDate ? new Date(startDate) : new Date("1970-01-01");
      rangeEnd = endDate ? new Date(endDate) : new Date();
    } else {
      rangeStart = new Date();
      rangeStart.setDate(rangeStart.getDate() - parseInt(days));
      rangeEnd = new Date();
    }

    const scopedUserIds = await getScopedUserIds(teamId, req.user, role);

    const query = {
      user: userId ? userId : { $in: scopedUserIds },
      date: { $gte: rangeStart, $lte: rangeEnd },
    };

    // Get total count
    const totalCount = await Activity.countDocuments(query);

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === "asc" ? 1 : -1;

    const activities = await Activity.find(query)
      .populate("user", "name email")
      .sort(sortObj)
      .skip((page - 1) * parseInt(limit))
      .limit(parseInt(limit));

    // Process activities to mask emails for non-admin users
    const processedActivities = activities.map(activity => {
      const actObj = activity.toObject();
      if (role !== 'admin' && actObj.user && actObj.user.email) {
        if (!canViewFullEmail(req.user._id.toString(), actObj.user._id, role)) {
          actObj.user.email = maskEmail(actObj.user.email);
        }
      }
      return actObj;
    });

    // Group by date for timeline
    const groupedActivities = processedActivities.reduce((acc, activity) => {
      const date = new Date(activity.date).toISOString().split("T")[0];
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(activity);
      return acc;
    }, {});

    res.json({
      success: true,
      count: processedActivities.length,
      total: totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      data: {
        activities: processedActivities,
        groupedByDate: groupedActivities,
      },
    });
  } catch (error) {
    console.error("Get activity feed error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching activity feed",
      error: error.message,
    });
  }
};

/**
 * @desc    Get Manager team overview
 * @route   GET /api/teams/:teamId/admin/project-manager-view
 * @access  Private (Manager/Manager)
 */
exports.getProjectManagerView = async (req, res) => {
  try {
    const { teamId } = req.params;
    const role = req.teamMembership?.role;

    // Get direct reports (people reporting to this user)
    const directReports = await TeamMember.find({
      team: teamId,
      status: "active",
      reportingManager: req.user._id,
    })
      .populate("user", "name email")
      .select("user role joinedAt");

    // Get direct reports with their stats
    const directReportsWithStats = await Promise.all(
      directReports.map(async (report) => {
        const userId = report.user._id;

        // Get task stats
        const assignedTasks = await Task.countDocuments({
          team: teamId,
          assignedTo: userId,
        });
        const completedTasks = await Task.countDocuments({
          team: teamId,
          assignedTo: userId,
          status: { $in: ["completed", "done"] },
        });

        // Get activities (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const recentActivities = await Activity.countDocuments({
          user: userId,
          date: { $gte: sevenDaysAgo },
        });

        // Mask emails for non-admin users
        const userObj = report.user.toObject ? report.user.toObject() : { ...report.user };
        if (role !== 'admin' && userObj.email) {
          userObj.email = maskEmail(userObj.email);
        }

        return {
          _id: report._id,
          user: userObj,
          role: report.role,
          joinedAt: report.joinedAt,
          stats: {
            assignedTasks,
            completedTasks,
            completionRate:
              assignedTasks > 0
                ? Math.round((completedTasks / assignedTasks) * 100)
                : 0,
            recentActivities,
          },
        };
      }),
    );

    // Get projects where user is team lead
    const leadProjects = await Project.find({
      team: teamId,
      teamLead: req.user._id,
      isArchived: false,
    }).select("name description color");

    // Get project members for all lead projects
    const projectMembersData = await Promise.all(
      leadProjects.map(async (project) => {
        const members = await ProjectMember.find({ project: project._id })
          .populate("user", "name email")
          .select("user role");

        // Get project task stats
        const totalTasks = await Task.countDocuments({ project: project._id });
        const completedTasks = await Task.countDocuments({
          project: project._id,
          status: { $in: ["completed", "done"] },
        });

        // Get member stats
        const membersWithStats = await Promise.all(
          members.map(async (member) => {
            const userId = member.user._id;
            const memberTasks = await Task.countDocuments({
              project: project._id,
              assignedTo: userId,
            });
            const memberCompleted = await Task.countDocuments({
              project: project._id,
              assignedTo: userId,
              status: { $in: ["completed", "done"] },
            });

            // Mask emails for non-admin users
            const userObj = member.user.toObject ? member.user.toObject() : { ...member.user };
            if (role !== 'admin' && userObj.email) {
              userObj.email = maskEmail(userObj.email);
            }

            return {
              user: userObj,
              role: member.role,
              stats: {
                assignedTasks: memberTasks,
                completedTasks: memberCompleted,
              },
            };
          }),
        );

        return {
          project: {
            _id: project._id,
            name: project.name,
            description: project.description,
            color: project.color,
          },
          stats: {
            totalTasks,
            completedTasks,
            memberCount: members.length,
          },
          members: membersWithStats,
        };
      }),
    );

    res.json({
      success: true,
      data: {
        directReports: directReportsWithStats,
        projects: projectMembersData,
        summary: {
          directReportsCount: directReportsWithStats.length,
          projectsCount: leadProjects.length,
          totalTeamSize:
            directReportsWithStats.length +
            projectMembersData.reduce((sum, p) => sum + p.members.length, 0),
        },
      },
    });
  } catch (error) {
    console.error("Get Manager view error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching Manager view",
      error: error.message,
    });
  }
};

/**
 * @desc    Get team analytics
 * @route   GET /api/teams/:teamId/admin/analytics
 * @access  Private (Admin)
 */
exports.getTeamAnalytics = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { timeRange = "week" } = req.query; // week, month, quarter

    // Calculate date range based on timeRange
    let days;
    switch (timeRange) {
      case "week":
        days = 7;
        break;
      case "month":
        days = 30;
        break;
      case "quarter":
        days = 90;
        break;
      default:
        days = 7;
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all tasks for this team
    const allTasks = await Task.find({ team: teamId }).select(
      "status createdAt completedAt assignedTo",
    );
    const tasksInRange = await Task.find({
      team: teamId,
      createdAt: { $gte: startDate },
    }).select("status createdAt completedAt assignedTo");

    // Calculate overall completion rate
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter((t) =>
      ["completed", "done"].includes(t.status),
    ).length;
    const completionRate =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Calculate previous period for trend
    const prevStartDate = new Date(startDate);
    prevStartDate.setDate(prevStartDate.getDate() - days);
    const prevPeriodTasks = await Task.find({
      team: teamId,
      createdAt: { $gte: prevStartDate, $lt: startDate },
    }).select("status");
    const prevCompletedTasks = prevPeriodTasks.filter((t) =>
      ["completed", "done"].includes(t.status),
    ).length;
    const prevCompletionRate =
      prevPeriodTasks.length > 0
        ? Math.round((prevCompletedTasks / prevPeriodTasks.length) * 100)
        : 0;
    const completionRateTrend = completionRate - prevCompletionRate;

    // Sprint velocity
    const completedSprints = await Sprint.find({
      team: teamId,
      status: "completed",
      actualEndDate: { $gte: startDate },
    }).select("name metrics.velocity actualEndDate");

    const averageVelocity =
      completedSprints.length > 0
        ? Math.round(
            completedSprints.reduce(
              (sum, s) => sum + (s.metrics?.velocity || 0),
              0,
            ) / completedSprints.length,
          )
        : 0;

    // Active members (members who completed at least one task in the period)
    const activeUserIds = new Set();
    tasksInRange.forEach((task) => {
      if (task.assignedTo && ["completed", "done"].includes(task.status)) {
        activeUserIds.add(task.assignedTo.toString());
      }
    });
    const activeMembers = activeUserIds.size;

    // Total members
    const totalMembers = await TeamMember.countDocuments({
      team: teamId,
      status: "active",
    });

    // Average task duration
    const completedTasksWithDates = allTasks.filter(
      (t) =>
        t.completedAt &&
        t.createdAt &&
        ["completed", "done"].includes(t.status),
    );
    const totalDuration = completedTasksWithDates.reduce((sum, task) => {
      const duration =
        (new Date(task.completedAt) - new Date(task.createdAt)) /
        (1000 * 60 * 60 * 24);
      return sum + duration;
    }, 0);
    const averageTaskDuration =
      completedTasksWithDates.length > 0
        ? Math.round(totalDuration / completedTasksWithDates.length)
        : 0;

    // Completion trend - daily breakdown
    const completionTrendMap = {};
    const totalTasksMap = {};

    // Group tasks by date
    tasksInRange.forEach((task) => {
      const dateKey = new Date(task.createdAt).toISOString().split("T")[0];
      totalTasksMap[dateKey] = (totalTasksMap[dateKey] || 0) + 1;
      if (["completed", "done"].includes(task.status)) {
        completionTrendMap[dateKey] = (completionTrendMap[dateKey] || 0) + 1;
      }
    });

    // Create sorted array with both completed and total
    const completionTrend = Object.keys(totalTasksMap)
      .sort()
      .slice(-10)
      .map((date) => ({
        date: new Date(date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        completed: completionTrendMap[date] || 0,
        total: totalTasksMap[date] || 0,
      }));

    // Project distribution
    const projectTaskCounts = await Task.aggregate([
      { $match: { team: teamId } },
      { $group: { _id: "$project", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const totalProjectTasks = projectTaskCounts.reduce(
      (sum, p) => sum + p.count,
      0,
    );
    const projects = await Project.find({
      _id: { $in: projectTaskCounts.map((p) => p._id).filter(Boolean) },
    }).select("name");

    const projectDistribution = projectTaskCounts
      .filter((item) => item._id) // Filter out null project IDs
      .map((item) => {
        const project = projects.find(
          (p) => p._id.toString() === item._id.toString(),
        );
        return {
          name: project ? project.name : "Unknown Project",
          taskCount: item.count,
          percentage:
            totalProjectTasks > 0
              ? Math.round((item.count / totalProjectTasks) * 100)
              : 0,
        };
      });

    // Member performance - top performers
    const memberTaskCounts = await Task.aggregate([
      { $match: { team: teamId, status: { $in: ["completed", "done"] } } },
      {
        $group: {
          _id: "$assignedTo",
          completedTasks: { $sum: 1 },
        },
      },
      { $sort: { completedTasks: -1 } },
      { $limit: 10 },
    ]);

    const memberIds = memberTaskCounts.map((m) => m._id).filter(Boolean);
    const members = await User.find({ _id: { $in: memberIds } }).select("name");

    const memberPerformance = await Promise.all(
      memberTaskCounts
        .filter((item) => item._id) // Filter out null user IDs
        .map(async (item) => {
          const member = members.find(
            (m) => m._id.toString() === item._id.toString(),
          );
          const totalAssigned = await Task.countDocuments({
            team: teamId,
            assignedTo: item._id,
          });
          const completionRate =
            totalAssigned > 0
              ? Math.round((item.completedTasks / totalAssigned) * 100)
              : 0;

          return {
            name: member ? member.name : "Unknown User",
            completedTasks: item.completedTasks,
            completionRate,
          };
        }),
    );

    // Task status distribution
    const tasksByStatus = await Task.aggregate([
      { $match: { team: teamId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const statusDistribution = tasksByStatus.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    // Overdue tasks
    const now = new Date();
    const overdueTasks = await Task.countDocuments({
      team: teamId,
      dueDate: { $lt: now },
      status: { $nin: ["completed", "done", "cancelled"] },
    });

    // Tasks created and completed in time range
    const tasksCreatedInRange = tasksInRange.length;
    const tasksCompletedInRange = tasksInRange.filter((t) =>
      ["completed", "done"].includes(t.status),
    ).length;

    // Sprint metrics
    const activeSprints = await Sprint.countDocuments({
      team: teamId,
      status: { $in: ["active", "planning"] },
    });

    const totalSprints = await Sprint.countDocuments({ team: teamId });

    // Recent bandwidth utilization
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const recentBandwidth = await BandwidthReport.find({
      team: teamId,
      year: currentYear,
      month: { $gte: currentMonth - 1 },
      status: "approved",
    }).select("utilizationPercentage availableBandwidth");

    const avgBandwidthUtilization =
      recentBandwidth.length > 0
        ? Math.round(
            recentBandwidth.reduce(
              (sum, r) => sum + r.utilizationPercentage,
              0,
            ) / recentBandwidth.length,
          )
        : 0;

    const teamAvailableBandwidth = recentBandwidth.reduce(
      (sum, r) => sum + (r.availableBandwidth || 0),
      0,
    );

    // Project health - projects with/without active sprints
    const projectsWithActiveSprints = await Project.countDocuments({
      team: teamId,
      isArchived: false,
      currentSprint: { $exists: true, $ne: null },
    });

    const totalActiveProjects = await Project.countDocuments({
      team: teamId,
      isArchived: false,
    });

    // Task priority distribution
    const tasksByPriority = await Task.aggregate([
      { $match: { team: teamId, status: { $nin: ["completed", "done"] } } },
      { $group: { _id: "$priority", count: { $sum: 1 } } },
    ]);

    const priorityDistribution = tasksByPriority.reduce((acc, item) => {
      acc[item._id || "none"] = item.count;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        // Core metrics
        completionRate,
        completionRateTrend,
        averageVelocity,
        activeMembers,
        totalMembers,
        averageTaskDuration,

        // Task metrics
        tasksCreatedInRange,
        tasksCompletedInRange,
        overdueTasks,
        statusDistribution,
        priorityDistribution,

        // Sprint metrics
        activeSprints,
        totalSprints,

        // Project metrics
        projectsWithActiveSprints,
        totalActiveProjects,

        // Bandwidth metrics
        avgBandwidthUtilization,
        teamAvailableBandwidth,

        // Trends and distributions
        completionTrend,
        projectDistribution,
        memberPerformance,
      },
    });
  } catch (error) {
    console.error("Get team analytics error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching team analytics",
      error: error.message,
    });
  }
};

/**
 * @desc    Update team member role
 * @route   PUT /api/teams/:teamId/admin/members/:userId/role
 * @access  Private (Admin)
 */
exports.updateMemberRole = async (req, res) => {
  try {
    const { teamId, userId } = req.params;
    const { role } = req.body;

    if (!["admin", "project_manager", "Manager", "member", "viewer"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role",
      });
    }

    const member = await TeamMember.findOne({
      team: teamId,
      user: userId,
    }).populate("user", "name email");

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Team member not found",
      });
    }

    member.role = role;
    await member.save();

    res.json({
      success: true,
      data: member,
      message: "Member role updated successfully",
    });
  } catch (error) {
    console.error("Update member role error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating member role",
      error: error.message,
    });
  }
};

/**
 * @desc    Remove team member
 * @route   DELETE /api/teams/:teamId/admin/members/:userId
 * @access  Private (Admin)
 */
exports.removeMember = async (req, res) => {
  try {
    const { teamId, userId } = req.params;

    const member = await TeamMember.findOne({ team: teamId, user: userId });

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Team member not found",
      });
    }

    // Don't allow removing the team owner
    const team = await Team.findById(teamId);
    if (team.owner.toString() === userId) {
      return res.status(403).json({
        success: false,
        message: "Cannot remove team owner",
      });
    }

    await member.deleteOne();

    res.json({
      success: true,
      message: "Member removed from team",
    });
  } catch (error) {
    console.error("Remove member error:", error);
    res.status(500).json({
      success: false,
      message: "Error removing member",
      error: error.message,
    });
  }
};

/**
 * @desc    Unlock a user's account (reset login attempts and remove lock)
 * @route   PUT /api/teams/:teamId/admin/members/:userId/unlock
 * @access  Private (Admin)
 */
exports.unlockAccount = async (req, res) => {
  try {
    const { teamId, userId } = req.params;

    // Verify the user is a member of this team
    const member = await TeamMember.findOne({
      team: teamId,
      user: userId,
    }).populate("user", "name email loginAttempts lockUntil");

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Team member not found",
      });
    }

    // Get the full user record to update lock status
    const user = await User.findById(userId).select("+loginAttempts +lockUntil");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if account is actually locked
    const wasLocked = user.lockUntil && user.lockUntil > Date.now();
    const hadAttempts = user.loginAttempts > 0;

    if (!wasLocked && !hadAttempts) {
      return res.status(400).json({
        success: false,
        message: "Account is not locked",
      });
    }

    // Reset login attempts and remove lock
    await user.resetLoginAttempts();

    res.json({
      success: true,
      message: wasLocked
        ? "Account unlocked successfully. User can now log in."
        : "Login attempts reset successfully.",
      data: {
        userId: user._id,
        name: user.name,
        wasLocked,
        previousAttempts: user.loginAttempts,
      },
    });
  } catch (error) {
    console.error("Unlock account error:", error);
    res.status(500).json({
      success: false,
      message: "Error unlocking account",
      error: error.message,
    });
  }
};

/**
 * @desc    Get locked accounts in the team
 * @route   GET /api/teams/:teamId/admin/locked-accounts
 * @access  Private (Admin)
 */
exports.getLockedAccounts = async (req, res) => {
  try {
    const { teamId } = req.params;

    // Get all team members
    const teamMembers = await TeamMember.find({
      team: teamId,
      status: "active",
    }).select("user");

    const userIds = teamMembers.map((m) => m.user);

    // Find locked users among team members
    const lockedUsers = await User.find({
      _id: { $in: userIds },
      $or: [
        { lockUntil: { $gt: Date.now() } },
        { loginAttempts: { $gte: 3 } }, // Also show users approaching lock
      ],
    }).select("name email loginAttempts lockUntil");

    const formattedUsers = lockedUsers.map((user) => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      loginAttempts: user.loginAttempts,
      isLocked: user.lockUntil && user.lockUntil > Date.now(),
      lockUntil: user.lockUntil,
      lockExpiresIn: user.lockUntil
        ? Math.max(0, Math.round((user.lockUntil - Date.now()) / 1000 / 60))
        : null, // Minutes remaining
    }));

    res.json({
      success: true,
      count: formattedUsers.length,
      data: formattedUsers,
    });
  } catch (error) {
    console.error("Get locked accounts error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching locked accounts",
      error: error.message,
    });
  }
};

/**
 * @desc    Get team activity history (for admin/manager)
 * @route   GET /api/teams/:teamId/admin/history
 * @access  Private (Admin/Manager)
 */
exports.getTeamHistory = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { startDate, endDate, userId, limit = 50, page = 1 } = req.query;
    const role = req.teamMembership?.role;
    const scopedUserIds = await getScopedUserIds(teamId, req.user, role);

    // Build query
    const query = { user: { $in: scopedUserIds } };

    // Filter by specific user if provided
    if (userId && scopedUserIds.includes(userId)) {
      query.user = userId;
    }

    // Filter by date range if provided
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const activities = await Activity.find(query)
      .populate("user", "name email")
      .sort({ date: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Activity.countDocuments(query);

    // Mask emails for non-admin users
    const processedActivities = activities.map((activity) => {
      const actObj = activity.toObject();
      if (role !== "admin" && actObj.user && actObj.user.email) {
        actObj.user.email = maskEmail(actObj.user.email);
      }
      return actObj;
    });

    res.json({
      success: true,
      count: processedActivities.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: processedActivities,
    });
  } catch (error) {
    console.error("Get team history error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching team history",
      error: error.message,
    });
  }
};

/**
 * @desc    Get team statistics (for admin/manager)
 * @route   GET /api/teams/:teamId/admin/statistics
 * @access  Private (Admin/Manager)
 */
exports.getTeamStatistics = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { startDate, endDate, userId } = req.query;
    const role = req.teamMembership?.role;
    const scopedUserIds = await getScopedUserIds(teamId, req.user, role);

    const start = startDate
      ? new Date(startDate)
      : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate) : new Date();

    // Build query
    const query = {
      user: { $in: scopedUserIds },
      date: { $gte: start, $lte: end },
    };

    // Filter by specific user if provided
    if (userId && scopedUserIds.includes(userId)) {
      query.user = userId;
    }

    const activities = await Activity.find(query).populate("user", "name");

    const stats = {
      totalDays: activities.length,
      totalHours: 0,
      totalMeetings: 0,
      totalTasks: 0,
      avgProductivity: 0,
      avgHoursPerDay: 0,
      tasksByStatus: {},
      tasksByCategory: {},
      moodDistribution: {},
    };

    activities.forEach((activity) => {
      stats.totalHours += activity.totalWorkHours;
      stats.totalMeetings += activity.meetings.length;
      stats.totalTasks += activity.tasks.length;
      stats.avgProductivity += activity.productivity;

      // Count tasks by status
      activity.tasks.forEach((task) => {
        stats.tasksByStatus[task.status] =
          (stats.tasksByStatus[task.status] || 0) + 1;
        stats.tasksByCategory[task.category] =
          (stats.tasksByCategory[task.category] || 0) + 1;
      });

      // Count mood distribution
      stats.moodDistribution[activity.mood] =
        (stats.moodDistribution[activity.mood] || 0) + 1;
    });

    if (activities.length > 0) {
      stats.avgProductivity = parseFloat(
        (stats.avgProductivity / activities.length).toFixed(1)
      );
      stats.avgHoursPerDay = parseFloat(
        (stats.totalHours / activities.length).toFixed(2)
      );
    }

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Get team statistics error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching team statistics",
      error: error.message,
    });
  }
};

/**
 * @desc    Get member comparison statistics (for admin/manager)
 * @route   GET /api/teams/:teamId/admin/comparison
 * @access  Private (Admin/Manager)
 */
exports.getMemberComparison = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { startDate, endDate } = req.query;
    const role = req.teamMembership?.role;
    const scopedUserIds = await getScopedUserIds(teamId, req.user, role);

    const start = startDate
      ? new Date(startDate)
      : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate) : new Date();

    // Get team members with their info
    const teamMembers = await TeamMember.find({
      team: teamId,
      user: { $in: scopedUserIds },
      status: "active",
    }).populate("user", "name email");

    // Get stats for each member
    const memberStats = await Promise.all(
      teamMembers.map(async (member) => {
        const activities = await Activity.find({
          user: member.user._id,
          date: { $gte: start, $lte: end },
        });

        let totalHours = 0;
        let totalTasks = 0;
        let totalMeetings = 0;
        let totalProductivity = 0;
        let completedTasks = 0;

        activities.forEach((activity) => {
          totalHours += activity.totalWorkHours;
          totalMeetings += activity.meetings.length;
          totalTasks += activity.tasks.length;
          totalProductivity += activity.productivity;
          completedTasks += activity.tasks.filter(
            (t) => t.status === "completed"
          ).length;
        });

        const avgProductivity =
          activities.length > 0
            ? parseFloat((totalProductivity / activities.length).toFixed(1))
            : 0;
        const avgHoursPerDay =
          activities.length > 0
            ? parseFloat((totalHours / activities.length).toFixed(2))
            : 0;
        const taskCompletionRate =
          totalTasks > 0
            ? parseFloat(((completedTasks / totalTasks) * 100).toFixed(1))
            : 0;

        // Mask email for non-admin
        const email =
          role === "admin"
            ? member.user.email
            : maskEmail(member.user.email);

        return {
          userId: member.user._id,
          name: member.user.name,
          email,
          role: member.role,
          stats: {
            activeDays: activities.length,
            totalHours: parseFloat(totalHours.toFixed(2)),
            avgHoursPerDay,
            totalTasks,
            completedTasks,
            taskCompletionRate,
            totalMeetings,
            avgProductivity,
          },
        };
      })
    );

    // Sort by total hours worked (descending)
    memberStats.sort((a, b) => b.stats.totalHours - a.stats.totalHours);

    // Calculate team averages for comparison
    const teamAverages = {
      avgHoursPerDay:
        memberStats.length > 0
          ? parseFloat(
              (
                memberStats.reduce((sum, m) => sum + m.stats.avgHoursPerDay, 0) /
                memberStats.length
              ).toFixed(2)
            )
          : 0,
      avgProductivity:
        memberStats.length > 0
          ? parseFloat(
              (
                memberStats.reduce(
                  (sum, m) => sum + m.stats.avgProductivity,
                  0
                ) / memberStats.length
              ).toFixed(1)
            )
          : 0,
      avgTaskCompletionRate:
        memberStats.length > 0
          ? parseFloat(
              (
                memberStats.reduce(
                  (sum, m) => sum + m.stats.taskCompletionRate,
                  0
                ) / memberStats.length
              ).toFixed(1)
            )
          : 0,
    };

    res.json({
      success: true,
      data: {
        members: memberStats,
        teamAverages,
        dateRange: { start, end },
        memberCount: memberStats.length,
      },
    });
  } catch (error) {
    console.error("Get member comparison error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching member comparison",
      error: error.message,
    });
  }
};
