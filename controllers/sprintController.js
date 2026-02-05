const Sprint = require("../models/Sprint");
const Project = require("../models/Project");
const Task = require("../models/Tasks");

/**
 * @desc    Get all sprints for a project
 * @route   GET /api/teams/:teamId/projects/:projectId/sprints
 * @access  Private
 */
exports.getSprints = async (req, res) => {
  try {
    const { projectId } = req.params;
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
      status,
    } = req.query;

    // Build query
    const query = { project: projectId };
    if (status) {
      query.status = status;
    }

    // Get total count
    const totalCount = await Sprint.countDocuments(query);

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === "asc" ? 1 : -1;

    const sprints = await Sprint.find(query)
      .populate("createdBy", "name email")
      .sort(sortObj)
      .skip((page - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: sprints.length,
      total: totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      data: sprints,
    });
  } catch (error) {
    console.error("Get sprints error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching sprints",
      error: error.message,
    });
  }
};

/**
 * @desc    Create new sprint
 * @route   POST /api/teams/:teamId/projects/:projectId/sprints
 * @access  Private (Manager+)
 */
exports.createSprint = async (req, res) => {
  try {
    const { projectId, teamId } = req.params;

    // Verify project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Create sprint
    const sprint = await Sprint.create({
      ...req.body,
      project: projectId,
      team: teamId,
      createdBy: req.user._id,
    });

    const populatedSprint = await Sprint.findById(sprint._id).populate(
      "createdBy",
      "name email",
    );

    res.status(201).json({
      success: true,
      data: populatedSprint,
    });
  } catch (error) {
    console.error("Create sprint error:", error);
    res.status(400).json({
      success: false,
      message: "Error creating sprint",
      error: error.message,
    });
  }
};

/**
 * @desc    Get single sprint
 * @route   GET /api/teams/:teamId/projects/:projectId/sprints/:sprintId
 * @access  Private
 */
exports.getSprint = async (req, res) => {
  try {
    const sprint = await Sprint.findById(req.params.sprintId)
      .populate("createdBy", "name email")
      .populate("retrospective.completedBy", "name email");

    if (!sprint) {
      return res.status(404).json({
        success: false,
        message: "Sprint not found",
      });
    }

    // Get sprint tasks with assignment info
    const tasks = await Task.find({ sprint: sprint._id })
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email")
      .sort({ position: 1 });

    res.json({
      success: true,
      data: {
        ...sprint.toObject(),
        tasks,
      },
    });
  } catch (error) {
    console.error("Get sprint error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching sprint",
      error: error.message,
    });
  }
};

/**
 * @desc    Update sprint
 * @route   PUT /api/teams/:teamId/projects/:projectId/sprints/:sprintId
 * @access  Private (Manager+)
 */
exports.updateSprint = async (req, res) => {
  try {
    let sprint = await Sprint.findById(req.params.sprintId);

    if (!sprint) {
      return res.status(404).json({
        success: false,
        message: "Sprint not found",
      });
    }

    // Don't allow updating completed sprints
    if (sprint.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Cannot update a completed sprint",
      });
    }

    sprint = await Sprint.findByIdAndUpdate(req.params.sprintId, req.body, {
      new: true,
      runValidators: true,
    }).populate("createdBy", "name email");

    res.json({
      success: true,
      data: sprint,
    });
  } catch (error) {
    console.error("Update sprint error:", error);
    res.status(400).json({
      success: false,
      message: "Error updating sprint",
      error: error.message,
    });
  }
};

/**
 * @desc    Delete sprint
 * @route   DELETE /api/teams/:teamId/projects/:projectId/sprints/:sprintId
 * @access  Private (Manager+)
 */
exports.deleteSprint = async (req, res) => {
  try {
    const sprint = await Sprint.findById(req.params.sprintId);

    if (!sprint) {
      return res.status(404).json({
        success: false,
        message: "Sprint not found",
      });
    }

    // Don't allow deleting active or completed sprints
    if (sprint.status === "active" || sprint.status === "completed") {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete an active or completed sprint. Cancel it first.",
      });
    }

    // Move all sprint tasks back to backlog
    await Task.updateMany({ sprint: sprint._id }, { $unset: { sprint: 1 } });

    await sprint.deleteOne();

    res.json({
      success: true,
      message: "Sprint deleted and tasks moved to backlog",
    });
  } catch (error) {
    console.error("Delete sprint error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting sprint",
      error: error.message,
    });
  }
};

/**
 * @desc    Start sprint
 * @route   POST /api/teams/:teamId/projects/:projectId/sprints/:sprintId/start
 * @access  Private (Manager+)
 */
exports.startSprint = async (req, res) => {
  try {
    const sprint = await Sprint.findById(req.params.sprintId);

    if (!sprint) {
      return res.status(404).json({
        success: false,
        message: "Sprint not found",
      });
    }

    // Check if there's already an active sprint for this project
    const activeSprint = await Sprint.findOne({
      project: sprint.project,
      status: "active",
    });

    if (activeSprint) {
      return res.status(400).json({
        success: false,
        message:
          "Another sprint is already active. Complete it before starting a new one.",
      });
    }

    // Update metrics before starting
    await sprint.updateMetrics();

    // Start the sprint
    await sprint.start();

    // Update project's current sprint
    await Project.findByIdAndUpdate(sprint.project, {
      currentSprint: sprint._id,
    });

    const updatedSprint = await Sprint.findById(sprint._id).populate(
      "createdBy",
      "name email",
    );

    res.json({
      success: true,
      data: updatedSprint,
      message: "Sprint started successfully",
    });
  } catch (error) {
    console.error("Start sprint error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Error starting sprint",
    });
  }
};

/**
 * @desc    Complete sprint
 * @route   POST /api/teams/:teamId/projects/:projectId/sprints/:sprintId/complete
 * @access  Private (Manager+)
 */
exports.completeSprint = async (req, res) => {
  try {
    const sprint = await Sprint.findById(req.params.sprintId);

    if (!sprint) {
      return res.status(404).json({
        success: false,
        message: "Sprint not found",
      });
    }

    // Update metrics before completing
    await sprint.updateMetrics();

    // Complete the sprint
    await sprint.complete();

    // Clear project's current sprint
    await Project.findByIdAndUpdate(sprint.project, {
      $unset: { currentSprint: 1 },
    });

    // Move incomplete tasks to backlog or next sprint based on req.body
    const { moveIncompleteTo } = req.body; // 'backlog' or nextSprintId

    const incompleteTasks = await Task.find({
      sprint: sprint._id,
      status: { $ne: "completed" },
    });

    if (moveIncompleteTo === "backlog") {
      // Keep sprint reference so backlog reflects pending tasks from previous sprint
    } else if (moveIncompleteTo) {
      // Move to another sprint
      await Task.updateMany(
        { sprint: sprint._id, status: { $ne: "completed" } },
        { sprint: moveIncompleteTo },
      );
    }

    const updatedSprint = await Sprint.findById(sprint._id).populate(
      "createdBy",
      "name email",
    );

    res.json({
      success: true,
      data: updatedSprint,
      message: `Sprint completed. ${incompleteTasks.length} incomplete tasks moved.`,
    });
  } catch (error) {
    console.error("Complete sprint error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Error completing sprint",
    });
  }
};

/**
 * @desc    Cancel sprint
 * @route   POST /api/teams/:teamId/projects/:projectId/sprints/:sprintId/cancel
 * @access  Private (Manager+)
 */
exports.cancelSprint = async (req, res) => {
  try {
    const sprint = await Sprint.findById(req.params.sprintId);

    if (!sprint) {
      return res.status(404).json({
        success: false,
        message: "Sprint not found",
      });
    }

    await sprint.cancel();

    // Clear project's current sprint if this was the active one
    const project = await Project.findById(sprint.project);
    if (
      project.currentSprint &&
      project.currentSprint.toString() === sprint._id.toString()
    ) {
      await Project.findByIdAndUpdate(sprint.project, {
        $unset: { currentSprint: 1 },
      });
    }

    // Move all tasks to backlog
    await Task.updateMany({ sprint: sprint._id }, { $unset: { sprint: 1 } });

    const updatedSprint = await Sprint.findById(sprint._id).populate(
      "createdBy",
      "name email",
    );

    res.json({
      success: true,
      data: updatedSprint,
      message: "Sprint cancelled and all tasks moved to backlog",
    });
  } catch (error) {
    console.error("Cancel sprint error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Error cancelling sprint",
    });
  }
};

/**
 * @desc    Get sprint burndown data
 * @route   GET /api/teams/:teamId/projects/:projectId/sprints/:sprintId/burndown
 * @access  Private
 */
exports.getBurndownData = async (req, res) => {
  try {
    const sprint = await Sprint.findById(req.params.sprintId);

    if (!sprint) {
      return res.status(404).json({
        success: false,
        message: "Sprint not found",
      });
    }

    // Update metrics and add current burndown data point if sprint is active
    if (sprint.status === "active") {
      await sprint.updateMetrics();
      await sprint.addBurndownDataPoint();
    }

    // Calculate ideal burndown line
    const idealBurndown = [];
    const totalPoints = sprint.metrics.totalStoryPoints;
    const duration = sprint.duration;

    if (duration > 0) {
      const pointsPerDay = totalPoints / duration;

      for (let i = 0; i <= duration; i++) {
        const date = new Date(sprint.startDate);
        date.setDate(date.getDate() + i);
        idealBurndown.push({
          date,
          remainingPoints: Math.max(0, totalPoints - pointsPerDay * i),
        });
      }
    }

    res.json({
      success: true,
      data: {
        actual: sprint.metrics.burndownData,
        ideal: idealBurndown,
        metrics: {
          totalStoryPoints: sprint.metrics.totalStoryPoints,
          completedStoryPoints: sprint.metrics.completedStoryPoints,
          progress: sprint.progress,
          daysRemaining: sprint.daysRemaining,
          isOverdue: sprint.isOverdue,
        },
      },
    });
  } catch (error) {
    console.error("Get burndown error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching burndown data",
      error: error.message,
    });
  }
};

/**
 * @desc    Submit sprint retrospective
 * @route   POST /api/teams/:teamId/projects/:projectId/sprints/:sprintId/retrospective
 * @access  Private (Manager+)
 */
exports.submitRetrospective = async (req, res) => {
  try {
    const sprint = await Sprint.findById(req.params.sprintId);

    if (!sprint) {
      return res.status(404).json({
        success: false,
        message: "Sprint not found",
      });
    }

    if (sprint.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Can only add retrospective to completed sprints",
      });
    }

    const { whatWentWell, whatNeedImprovement, actionItems } = req.body;

    sprint.retrospective = {
      whatWentWell,
      whatNeedImprovement,
      actionItems: actionItems || [],
      completedAt: new Date(),
      completedBy: req.user._id,
    };

    await sprint.save();

    const updatedSprint = await Sprint.findById(sprint._id)
      .populate("createdBy", "name email")
      .populate("retrospective.completedBy", "name email");

    res.json({
      success: true,
      data: updatedSprint,
      message: "Retrospective submitted successfully",
    });
  } catch (error) {
    console.error("Submit retrospective error:", error);
    res.status(400).json({
      success: false,
      message: "Error submitting retrospective",
      error: error.message,
    });
  }
};

/**
 * @desc    Get project backlog (pending tasks from previous sprint)
 * @route   GET /api/teams/:teamId/projects/:projectId/backlog
 * @access  Private
 */
exports.getBacklog = async (req, res) => {
  try {
    const { projectId } = req.params;
    const {
      page = 1,
      limit = 20,
      sortBy = "priority",
      sortOrder = "desc",
    } = req.query;

    const previousSprint = await Sprint.findOne({
      project: projectId,
      status: "completed",
    }).sort({ endDate: -1, createdAt: -1 });

    if (!previousSprint) {
      return res.json({
        success: true,
        count: 0,
        total: 0,
        page: parseInt(page),
        totalPages: 0,
        data: [],
      });
    }

    const query = {
      project: projectId,
      sprint: previousSprint._id,
      status: { $ne: "completed" },
    };

    // Get total count
    const totalCount = await Task.countDocuments(query);

    // Build sort object
    const sortObj = {};
    if (sortBy === "priority") {
      // Priority sort: urgent > high > medium > low
      const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
      sortObj.priority = sortOrder === "asc" ? 1 : -1;
    } else {
      sortObj[sortBy] = sortOrder === "asc" ? 1 : -1;
    }

    const backlogTasks = await Task.find(query)
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email")
      .sort(sortObj)
      .skip((page - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: backlogTasks.length,
      total: totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      data: backlogTasks,
    });
  } catch (error) {
    console.error("Get backlog error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching backlog",
      error: error.message,
    });
  }
};

/**
 * @desc    Add tasks to sprint from backlog
 * @route   POST /api/teams/:teamId/projects/:projectId/sprints/:sprintId/tasks
 * @access  Private (Manager+)
 */
exports.addTasksToSprint = async (req, res) => {
  try {
    const { sprintId } = req.params;
    const { taskIds } = req.body;

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Task IDs array is required",
      });
    }

    const sprint = await Sprint.findById(sprintId);

    if (!sprint) {
      return res.status(404).json({
        success: false,
        message: "Sprint not found",
      });
    }

    if (sprint.status === "completed" || sprint.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Cannot add tasks to a completed or cancelled sprint",
      });
    }

    // Update tasks to belong to this sprint
    await Task.updateMany({ _id: { $in: taskIds } }, { sprint: sprintId });

    // Update sprint metrics
    await sprint.updateMetrics();

    res.json({
      success: true,
      message: `${taskIds.length} tasks added to sprint`,
      data: sprint,
    });
  } catch (error) {
    console.error("Add tasks to sprint error:", error);
    res.status(500).json({
      success: false,
      message: "Error adding tasks to sprint",
      error: error.message,
    });
  }
};

/**
 * @desc    Remove task from sprint (back to backlog)
 * @route   DELETE /api/teams/:teamId/projects/:projectId/sprints/:sprintId/tasks/:taskId
 * @access  Private (Manager+)
 */
exports.removeTaskFromSprint = async (req, res) => {
  try {
    const { sprintId, taskId } = req.params;

    const sprint = await Sprint.findById(sprintId);

    if (!sprint) {
      return res.status(404).json({
        success: false,
        message: "Sprint not found",
      });
    }

    if (sprint.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Cannot remove tasks from a completed sprint",
      });
    }

    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // Remove sprint reference
    task.sprint = undefined;
    await task.save();

    // Update sprint metrics
    await sprint.updateMetrics();

    res.json({
      success: true,
      message: "Task removed from sprint and moved to backlog",
    });
  } catch (error) {
    console.error("Remove task from sprint error:", error);
    res.status(500).json({
      success: false,
      message: "Error removing task from sprint",
      error: error.message,
    });
  }
};
