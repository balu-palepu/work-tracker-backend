const Project = require("../models/Project");
const ProjectMember = require("../models/ProjectMember");
const Task = require("../models/Tasks");
const TeamMember = require("../models/TeamMember");
const Notification = require("../models/Notification");
const Sprint = require("../models/Sprint");
const Team = require("../models/Team");
const { createNotification } = require("./notificationController");

const WORK_ITEM_RANK = {
  epic: 0,
  feature: 1,
  story: 2,
  task: 3,
  bug: 3,
  subtask: 4,
};

const PARENT_REQUIRED_TYPES = ['subtask'];

const validateParentRelationship = async ({
  projectId,
  taskId,
  parentTaskId,
  childType,
}) => {
  if (!parentTaskId) return null;

  const parent = await Task.findOne({ _id: parentTaskId, project: projectId });
  if (!parent) {
    throw new Error("Parent task not found in this project");
  }

  if (taskId && parent._id.toString() === taskId.toString()) {
    throw new Error("A task cannot be its own parent");
  }

  const parentRank = WORK_ITEM_RANK[parent.workItemType] ?? 99;
  const childRank = WORK_ITEM_RANK[childType] ?? 99;
  if (parentRank >= childRank) {
    throw new Error(
      "Parent item must be a higher-level work item (Epic > Feature > Story > Task/Bug > Subtask)",
    );
  }

  return parent;
};

// @desc    Get all projects for team
// @route   GET /api/teams/:teamId/projects
// @access  Private
exports.getProjects = async (req, res) => {
  try {
    const teamId = req.params.teamId;
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
      search = "",
    } = req.query;

    // Check if user is admin or Manager (they can see all projects)
    const isAdminOrManager =
      req.teamMembership &&
      (req.teamMembership.role === "admin" ||
        req.teamMembership.role === "Manager");

    let query = {
      team: teamId,
      isArchived: false,
    };

    // Add search if provided
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    let totalCount;
    let projects;

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === "asc" ? 1 : -1;

    if (isAdminOrManager) {
      // Admins and Managers can see all projects
      totalCount = await Project.countDocuments(query);

      projects = await Project.find(query)
        .populate("createdBy", "name email")
        .populate("currentSprint", "name status")
        .populate("teamLead", "name email")
        .sort(sortObj)
        .skip((page - 1) * parseInt(limit))
        .limit(parseInt(limit));
    } else {
      // Regular users only see projects they're assigned to
      const projectMemberships = await ProjectMember.find({
        user: req.user._id,
      }).select("project");

      const projectIds = projectMemberships.map((pm) => pm.project);

      query._id = { $in: projectIds };
      totalCount = await Project.countDocuments(query);

      projects = await Project.find(query)
        .populate("createdBy", "name email")
        .populate("currentSprint", "name status")
        .populate("teamLead", "name email")
        .sort(sortObj)
        .skip((page - 1) * parseInt(limit))
        .limit(parseInt(limit));
    }

    // Get user's role in each project
    const projectsWithRoles = await Promise.all(
      projects.map(async (project) => {
        const membership = await ProjectMember.findOne({
          project: project._id,
          user: req.user._id,
        });

        return {
          ...project.toObject(),
          userRole: membership?.role || null,
          userPermissions: membership?.permissions || null,
        };
      }),
    );

    res.json({
      success: true,
      count: projectsWithRoles.length,
      total: totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      data: projectsWithRoles,
    });
  } catch (error) {
    console.error("Get projects error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching projects",
      error: error.message,
    });
  }
};

// @desc    Create new project
// @route   POST /api/teams/:teamId/projects
// @access  Private
exports.createProject = async (req, res) => {
  try {
    const teamId = req.params.teamId;
    const { members, teamLeadId } = req.body; // Optional members array and teamLeadId

    const isAdminOrPm =
      req.teamMembership?.role === "admin" ||
      req.teamMembership?.role === "Manager";
    if (!isAdminOrPm) {
      const [isReportingManager, isExistingTeamLead] = await Promise.all([
        TeamMember.exists({
          team: teamId,
          reportingManager: req.user._id,
          status: "active",
        }),
        Project.exists({
          team: teamId,
          teamLead: req.user._id,
        }),
      ]);

      if (!isReportingManager && !isExistingTeamLead) {
        return res.status(403).json({
          success: false,
          message:
            "Insufficient permissions. Only Managers, team leads, or Managers can create projects.",
        });
      }
    }

    // Default workflow statuses
    const defaultWorkflowStatuses = [
      {
        id: "todo",
        label: "To Do",
        category: "todo",
        color: "#6B7280",
        order: 0,
      },
      {
        id: "inprogress",
        label: "In Progress",
        category: "inprogress",
        color: "#3B82F6",
        order: 1,
      },
      {
        id: "resolved",
        label: "Completed/Closed",
        category: "completed",
        color: "#10B981",
        order: 2,
      },
    ];

    const normalizedWorkflowStatuses = (
      req.body.settings?.workflowStatuses || defaultWorkflowStatuses
    )
      .filter((s) => s.id !== "closed")
      .map((s, index) => ({
        ...s,
        id:
          s.id === "new"
            ? "todo"
            : s.id === "active"
              ? "inprogress"
              : s.id === "closed"
                ? "resolved"
                : s.id,
        label:
          s.id === "new"
            ? "To Do"
            : s.id === "active"
              ? "In Progress"
              : s.id === "resolved" || s.id === "closed"
            ? "Completed/Closed"
            : s.label,
        order: typeof s.order === "number" ? s.order : index,
      }));

    // Merge with any provided settings
    const projectSettings = {
      ...(req.body.settings || {}),
      workflowStatuses: normalizedWorkflowStatuses,
      workItemTypes:
        req.body.settings?.workItemTypes || [
          "epic",
          "feature",
          "story",
          "task",
          "bug",
          "subtask",
        ],
    };

    // Create project
    const project = await Project.create({
      ...req.body,
      team: teamId,
      createdBy: req.user._id,
      teamLead: teamLeadId || null,
      settings: projectSettings,
      // Keep user field for backward compatibility
      user: req.user._id,
    });

    // Auto-create first sprint on project creation
    const team = await Team.findById(teamId).select(
      "settings.defaultSprintDuration",
    );
    const sprintDuration = team?.settings?.defaultSprintDuration || 14;
    const sprintStart = new Date();
    sprintStart.setHours(0, 0, 0, 0);
    const sprintEnd = new Date(sprintStart);
    sprintEnd.setDate(sprintEnd.getDate() + sprintDuration - 1);

    const sprint = await Sprint.create({
      name: `${project.name} Sprint 1`,
      project: project._id,
      team: teamId,
      createdBy: req.user._id,
      startDate: sprintStart,
      endDate: sprintEnd,
      status: "active",
    });

    project.currentSprint = sprint._id;
    await project.save();

    // Create project membership for creator (owner role)
    await ProjectMember.create({
      project: project._id,
      user: req.user._id,
      role: "owner",
      addedBy: req.user._id,
    });

    // Ensure team lead has project membership (manager) so they can manage members later
    if (teamLeadId && teamLeadId.toString() !== req.user._id.toString()) {
      try {
        await ProjectMember.create({
          project: project._id,
          user: teamLeadId,
          role: "manager",
          addedBy: req.user._id,
        });
      } catch (err) {
        if (err?.code !== 11000) throw err;
      }
    }

    // Assign team members if provided
    if (members && Array.isArray(members) && members.length > 0) {
      // Normalize + de-dupe userIds; and never re-add creator (already owner)
      const normalizedMembers = members
        .map((m) => ({
          userId: (m?.userId || m?.user || "").toString(),
          role: m?.role || "contributor",
        }))
        .filter((m) => !!m.userId)
        .filter((m) => m.userId !== req.user._id.toString());

      const uniqueByUserId = new Map();
      for (const m of normalizedMembers) {
        if (!uniqueByUserId.has(m.userId)) uniqueByUserId.set(m.userId, m);
      }

      const uniqueMembers = Array.from(uniqueByUserId.values());

      for (const member of uniqueMembers) {
        // Verify member is part of the team
        const teamMember = await TeamMember.findOne({
          team: teamId,
          user: member.userId,
          status: "active",
        });

        if (!teamMember) continue;

        try {
          await ProjectMember.create({
            project: project._id,
            user: member.userId,
            role: member.role || "contributor",
            addedBy: req.user._id,
          });
        } catch (err) {
          // Ignore duplicate membership insert (unique index project+user)
          if (err?.code !== 11000) throw err;
        }
      }
    }

    // Create notification if team lead is assigned
    if (teamLeadId && teamLeadId.toString() !== req.user._id.toString()) {
      await createNotification({
        recipient: teamLeadId,
        team: teamId,
        type: "project_assigned",
        title: "Assigned as Team Lead",
        message: `You have been assigned as team lead for project "${project.name}"`,
        relatedProject: project._id,
        actor: req.user._id,
        actionUrl: `/teams/${teamId}/projects/${project._id}`,
      });
    }

    // Populate project with team lead
    const populatedProject = await Project.findById(project._id)
      .populate("teamLead", "name email")
      .populate("createdBy", "name email");

    res.status(201).json({
      success: true,
      data: populatedProject,
    });
  } catch (error) {
    console.error("Create project error:", error);
    res.status(400).json({
      success: false,
      message: "Error creating project",
      error: error.message,
    });
  }
};

// @desc    Get single project
// @route   GET /api/teams/:teamId/projects/:id
// @access  Private
exports.getProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate("createdBy", "name email")
      .populate("currentSprint", "name status startDate endDate")
      .populate("teamLead", "name email");

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Check team membership (already verified by middleware)
    if (project.team.toString() !== req.params.teamId) {
      return res.status(403).json({
        success: false,
        message: "Project does not belong to this team",
      });
    }

    // Get user's project membership
    const membership = await ProjectMember.findOne({
      project: project._id,
      user: req.user._id,
    });

    // Check if user is admin or Manager (they can see all projects)
    const isAdminOrManager =
      req.teamMembership &&
      (req.teamMembership.role === "admin" ||
        req.teamMembership.role === "Manager");

    // If user is not admin/manager and not a project member, deny access
    if (!isAdminOrManager && !membership) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this project",
      });
    }

    // Get member count
    const memberCount = await ProjectMember.countDocuments({
      project: project._id,
    });

    res.json({
      success: true,
      data: {
        ...project.toObject(),
        userRole: membership?.role || null,
        userPermissions: membership?.permissions || null,
        memberCount,
      },
    });
  } catch (error) {
    console.error("Get project error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching project",
      error: error.message,
    });
  }
};

// @desc    Update project
// @route   PUT /api/teams/:teamId/projects/:id
// @access  Private (Project Owner/Manager)
exports.updateProject = async (req, res) => {
  try {
    let project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Permission check handled by middleware
    project = await Project.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate("createdBy", "name email");

    res.json({
      success: true,
      data: project,
    });
  } catch (error) {
    console.error("Update project error:", error);
    res.status(400).json({
      success: false,
      message: "Error updating project",
      error: error.message,
    });
  }
};

// @desc    Delete project
// @route   DELETE /api/teams/:teamId/projects/:id
// @access  Private (Project Owner only)
exports.deleteProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Check if user is the creator or an admin
    const isCreator = project.createdBy && project.createdBy.toString() === req.user._id.toString();
    const isAdmin = req.teamMembership?.role === 'admin';

    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Only the project creator or admin can delete this project",
      });
    }

    // Delete all related data (cascade delete)
    await Promise.all([
      // Delete all project members
      ProjectMember.deleteMany({ project: projectId }),
      // Delete all tasks in this project
      Task.deleteMany({ project: projectId }),
      // Delete all sprints in this project
      Sprint.deleteMany({ project: projectId }),
      // Delete all notifications related to this project
      Notification.deleteMany({ relatedProject: projectId }),
    ]);

    // Delete project
    await project.deleteOne();

    res.json({
      success: true,
      message: "Project and all associated data deleted permanently",
    });
  } catch (error) {
    console.error("Delete project error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting project",
      error: error.message,
    });
  }
};

// @desc    Get all tasks for a project
// @route   GET /api/teams/:teamId/projects/:projectId/tasks
// @access  Private
exports.getProjectTasks = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const tasks = await Task.find({ project: req.params.projectId })
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email")
      .sort({ position: 1 });

    res.json({
      success: true,
      count: tasks.length,
      data: tasks,
    });
  } catch (error) {
    console.error("Get project tasks error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching tasks",
      error: error.message,
    });
  }
};

// @desc    Create new task
// @route   POST /api/teams/:teamId/projects/:projectId/tasks
// @access  Private
exports.createTask = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const workflowStatuses = project?.settings?.workflowStatuses || [];
    const defaultStatus = req.body.status || workflowStatuses[0]?.id || "todo";

    const childType = req.body.workItemType || "task";
    if (PARENT_REQUIRED_TYPES.includes(childType) && !req.body.parentTask) {
      return res.status(400).json({
        success: false,
        message: `A parent item is required for ${childType} work items.`,
      });
    }

    await validateParentRelationship({
      projectId: req.params.projectId,
      parentTaskId: req.body.parentTask,
      childType,
    });

    // Get position for new task
    const maxPosition = await Task.findOne({
      project: req.params.projectId,
      status: defaultStatus,
    }).sort({ position: -1 });

    const assignedTo = req.body.assignedTo || null;
    const mentions = Array.isArray(req.body.mentions) ? req.body.mentions : [];

    const task = await Task.create({
      ...req.body,
      status: defaultStatus,
      assignedTo,
      assignedBy: assignedTo ? req.user._id : undefined,
      project: req.params.projectId,
      team: project.team,
      createdBy: req.user._id,
      position: maxPosition ? maxPosition.position + 1 : 0,
    });

    const populatedTask = await Task.findById(task._id)
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email")
      .populate("parentTask", "title workItemType _id");

    if (assignedTo) {
      await createNotification({
        recipient: assignedTo,
        team: project.team,
        type: "task_assigned",
        title: "Task Assigned",
        message: `You have been assigned a task: "${task.title}"`,
        relatedTask: task._id,
        relatedProject: project._id,
        actor: req.user._id,
        actionUrl: `/teams/${project.team}/projects/${project._id}?taskId=${task._id}`,
      });
    }

    const uniqueMentions = Array.from(
      new Set(mentions.map((id) => id.toString())),
    )
      .filter((id) => id !== req.user._id.toString())
      .filter((id) => (assignedTo ? id !== assignedTo.toString() : true));

    await Promise.all(
      uniqueMentions.map((recipientId) =>
        createNotification({
          recipient: recipientId,
          team: project.team,
          type: "mention",
          title: "Mentioned in a task",
          message: `You were mentioned in "${task.title}"`,
          relatedTask: task._id,
          relatedProject: project._id,
          actor: req.user._id,
          actionUrl: `/teams/${project.team}/projects/${project._id}?taskId=${task._id}`,
        }),
      ),
    );

    res.status(201).json({
      success: true,
      data: populatedTask,
    });
  } catch (error) {
    console.error("Create task error:", error);
    res.status(400).json({
      success: false,
      message: "Error creating task",
      error: error.message,
    });
  }
};

// @desc    Get single task
// @route   GET /api/teams/:teamId/projects/:projectId/tasks/:taskId
// @access  Private
exports.getTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId)
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email")
      .populate("project", "name")
      .populate("parentTask", "title workItemType _id parentTask")
      .populate("comments.user", "name email");

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    console.error("Get task error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching task",
      error: error.message,
    });
  }
};

// @desc    Update task
// @route   PUT /api/teams/:teamId/projects/:projectId/tasks/:taskId
// @access  Private
exports.updateTask = async (req, res) => {
  try {
    let task = await Task.findById(req.params.taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    const previousAssignedTo = task.assignedTo
      ? task.assignedTo.toString()
      : null;
    const nextAssignedTo = req.body.assignedTo || null;
    const mentions = Array.isArray(req.body.mentions) ? req.body.mentions : [];

    const effectiveType = req.body.workItemType || task.workItemType || "task";
    const effectiveParent = Object.prototype.hasOwnProperty.call(req.body, "parentTask")
      ? req.body.parentTask
      : task.parentTask;

    if (PARENT_REQUIRED_TYPES.includes(effectiveType) && !effectiveParent) {
      return res.status(400).json({
        success: false,
        message: `A parent item is required for ${effectiveType} work items.`,
      });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "parentTask")) {
      await validateParentRelationship({
        projectId: req.params.projectId,
        taskId: req.params.taskId,
        parentTaskId: req.body.parentTask,
        childType: effectiveType,
      });
    }

    task = await Task.findByIdAndUpdate(
      req.params.taskId,
      {
        ...req.body,
        assignedTo: nextAssignedTo,
        assignedBy: nextAssignedTo ? req.user._id : undefined,
      },
      { new: true, runValidators: true },
    )
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email")
      .populate("parentTask", "title workItemType _id");

    if (nextAssignedTo && nextAssignedTo !== previousAssignedTo) {
      const project = await Project.findById(task.project);
      await createNotification({
        recipient: nextAssignedTo,
        team: task.team,
        type: "task_assigned",
        title: "Task Assigned",
        message: `You have been assigned a task: "${task.title}"`,
        relatedTask: task._id,
        relatedProject: task.project,
        actor: req.user._id,
        actionUrl: project
          ? `/teams/${project.team}/projects/${project._id}?taskId=${task._id}`
          : `/teams/${task.team}/projects/${task.project}?taskId=${task._id}`,
      });
    }

    if (mentions.length > 0) {
      const project = await Project.findById(task.project);
      const uniqueMentions = Array.from(
        new Set(mentions.map((id) => id.toString())),
      )
        .filter((id) => id !== req.user._id.toString())
        .filter((id) =>
          nextAssignedTo ? id !== nextAssignedTo.toString() : true,
        );

      await Promise.all(
        uniqueMentions.map((recipientId) =>
          createNotification({
            recipient: recipientId,
            team: task.team,
            type: "mention",
            title: "Mentioned in a task",
            message: `You were mentioned in "${task.title}"`,
            relatedTask: task._id,
            relatedProject: task.project,
            actor: req.user._id,
            actionUrl: project
              ? `/teams/${project.team}/projects/${project._id}?taskId=${task._id}`
              : `/teams/${task.team}/projects/${task.project}?taskId=${task._id}`,
          }),
        ),
      );
    }

    // Update sprint metrics if task belongs to a sprint (e.g. story points changed)
    if (task.sprint) {
      const sprint = await Sprint.findById(task.sprint);
      if (sprint && (sprint.status === 'active' || sprint.status === 'planning')) {
        await sprint.updateMetrics();
      }
    }

    res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    console.error("Update task error:", error);
    res.status(400).json({
      success: false,
      message: "Error updating task",
      error: error.message,
    });
  }
};

// @desc    Add comment to task
// @route   POST /api/teams/:teamId/projects/:projectId/tasks/:taskId/comments
// @access  Private
exports.addTaskComment = async (req, res) => {
  try {
    const { text, mentions = [] } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: "Comment text is required",
      });
    }

    const task = await Task.findById(req.params.taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    task.comments.push({
      user: req.user._id,
      text: text.trim(),
    });

    await task.save();

    const populatedTask = await Task.findById(task._id)
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email")
      .populate("project", "name")
      .populate("comments.user", "name email");

    const uniqueMentions = Array.from(
      new Set(mentions.map((id) => id.toString())),
    );

    await Promise.all(
      uniqueMentions.map((recipientId) =>
        createNotification({
          recipient: recipientId,
          team: task.team,
          type: "mention",
          title: "Mentioned in a task",
          message: `You were mentioned in "${task.title}"`,
          relatedTask: task._id,
          relatedProject: task.project,
          actor: req.user._id,
          actionUrl: `/teams/${task.team}/projects/${task.project}?taskId=${task._id}`,
        }),
      ),
    );

    res.status(201).json({
      success: true,
      data: populatedTask,
    });
  } catch (error) {
    console.error("Add task comment error:", error);
    res.status(500).json({
      success: false,
      message: "Error adding comment",
      error: error.message,
    });
  }
};

// @desc    Delete task
// @route   DELETE /api/teams/:teamId/projects/:projectId/tasks/:taskId
// @access  Private
exports.deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    await task.deleteOne();

    res.json({
      success: true,
      message: "Task deleted",
    });
  } catch (error) {
    console.error("Delete task error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting task",
      error: error.message,
    });
  }
};

// @desc    Update task status (for drag & drop)
// @route   PATCH /api/teams/:teamId/projects/:projectId/tasks/:taskId/status
// @access  Private
exports.updateTaskStatus = async (req, res) => {
  try {
    const { status, position, resolution, completionReason } = req.body;

    const task = await Task.findById(req.params.taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // Check if the new status belongs to a 'completed' category
    const project = await Project.findById(task.project);
    const workflowStatuses = project?.settings?.workflowStatuses || [];
    const targetStatus = workflowStatuses.find(ws => ws.id === status);
    const isCompletedCategory = targetStatus?.category === 'completed' ||
      status === 'completed' || status === 'resolved' || status === 'closed';

    task.status = status;
    if (position !== undefined) {
      task.position = position;
    }

    // Handle completion fields
    if (isCompletedCategory) {
      if (!completionReason || !completionReason.trim()) {
        return res.status(400).json({
          success: false,
          message: "Closing comment is required when moving to Completed/Closed",
        });
      }
      if (!task.completedAt) {
        task.completedAt = new Date();
      }
      if (resolution) task.resolution = resolution;
      task.completionReason = completionReason.trim();
    } else {
      task.completedAt = null;
      task.resolution = '';
      task.completionReason = '';
    }

    await task.save();

    // Update sprint metrics if task belongs to a sprint
    if (task.sprint) {
      const sprint = await Sprint.findById(task.sprint);
      if (sprint && (sprint.status === 'active' || sprint.status === 'planning')) {
        await sprint.updateMetrics();
      }
    }

    const populatedTask = await Task.findById(task._id)
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email");

    res.json({
      success: true,
      data: populatedTask,
    });
  } catch (error) {
    console.error("Update task status error:", error);
    res.status(400).json({
      success: false,
      message: "Error updating task status",
      error: error.message,
    });
  }
};

// @desc    Assign team lead to project
// @route   PUT /api/teams/:teamId/projects/:id/team-lead
// @access  Private (Admin/Manager)
exports.assignTeamLead = async (req, res) => {
  try {
    const { teamLeadId } = req.body;
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Check team membership
    if (project.team.toString() !== req.params.teamId) {
      return res.status(403).json({
        success: false,
        message: "Project does not belong to this team",
      });
    }

    // Verify team lead is a member of the team
    if (teamLeadId) {
      const teamMember = await TeamMember.findOne({
        team: req.params.teamId,
        user: teamLeadId,
        status: "active",
      });

      if (!teamMember) {
        return res.status(400).json({
          success: false,
          message: "User is not an active member of this team",
        });
      }
    }

    // Update project
    project.teamLead = teamLeadId || null;
    await project.save();

    // Ensure assigned team lead has project membership (manager) so they can manage members later
    if (teamLeadId && teamLeadId.toString() !== req.user._id.toString()) {
      try {
        await ProjectMember.create({
          project: project._id,
          user: teamLeadId,
          role: "manager",
          addedBy: req.user._id,
        });
      } catch (err) {
        if (err?.code !== 11000) throw err;
      }
    }

    const populatedProject = await Project.findById(project._id)
      .populate("teamLead", "name email")
      .populate("createdBy", "name email");

    // Create notification if team lead is assigned
    if (teamLeadId && teamLeadId.toString() !== req.user._id.toString()) {
      const { createNotification } = require("./notificationController");
      await createNotification({
        recipient: teamLeadId,
        team: req.params.teamId,
        type: "project_assigned",
        title: "Assigned as Team Lead",
        message: `You have been assigned as team lead for project "${project.name}"`,
        relatedProject: project._id,
        actor: req.user._id,
        actionUrl: `/teams/${req.params.teamId}/projects/${project._id}`,
      });
    }

    res.json({
      success: true,
      data: populatedProject,
      message: teamLeadId
        ? "Team lead assigned successfully"
        : "Team lead removed successfully",
    });
  } catch (error) {
    console.error("Assign team lead error:", error);
    res.status(400).json({
      success: false,
      message: "Error assigning team lead",
      error: error.message,
    });
  }
};

// @desc    Get projects by team lead
// @route   GET /api/teams/:teamId/projects/team-lead/:userId
// @access  Private
exports.getProjectsByTeamLead = async (req, res) => {
  try {
    const { userId } = req.params;
    const teamId = req.params.teamId;

    const projects = await Project.find({
      team: teamId,
      teamLead: userId,
      isArchived: false,
    })
      .populate("createdBy", "name email")
      .populate("currentSprint", "name status")
      .populate("teamLead", "name email")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: projects.length,
      data: projects,
    });
  } catch (error) {
    console.error("Get projects by team lead error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching projects",
      error: error.message,
    });
  }
};

// @desc    Update project workflow settings
// @route   PUT /api/teams/:teamId/projects/:id/workflow
// @access  Private (Project Owner/Manager)
exports.updateProjectWorkflow = async (req, res) => {
  try {
    const { workflowStatuses, workItemTypes } = req.body;

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Validate workflow statuses
    if (workflowStatuses) {
      const normalizedWorkflow = workflowStatuses
        .filter((s) => s.id !== "closed")
        .map((s, index) => ({
          ...s,
          id:
            s.id === "new"
              ? "todo"
              : s.id === "active"
                ? "inprogress"
                : s.id === "closed"
                  ? "resolved"
                  : s.id,
          label:
            s.id === "new"
              ? "To Do"
              : s.id === "active"
                ? "In Progress"
                : s.id === "resolved" || s.id === "closed"
              ? "Completed/Closed"
              : s.label,
          order: typeof s.order === "number" ? s.order : index,
        }));

      // Ensure at least one status per category
      const categories = new Set(normalizedWorkflow.map((s) => s.category));
      if (!categories.has('todo') || !categories.has('inprogress') || !categories.has('completed')) {
        return res.status(400).json({
          success: false,
          message: "Workflow must have at least one status in each category (todo, inprogress, completed)",
        });
      }
      // Ensure unique IDs
      const ids = normalizedWorkflow.map((s) => s.id);
      if (new Set(ids).size !== ids.length) {
        return res.status(400).json({
          success: false,
          message: "Workflow status IDs must be unique",
        });
      }
      project.settings.workflowStatuses = normalizedWorkflow;
    }

    if (workItemTypes) {
      project.settings.workItemTypes = workItemTypes;
    }

    await project.save();

    res.json({
      success: true,
      data: project,
    });
  } catch (error) {
    console.error("Update workflow error:", error);
    res.status(400).json({
      success: false,
      message: "Error updating workflow",
      error: error.message,
    });
  }
};

// @desc    Get child tasks for a parent task
// @route   GET /api/teams/:teamId/projects/:projectId/tasks/:taskId/children
// @access  Private
exports.getTaskChildren = async (req, res) => {
  try {
    const children = await Task.find({
      project: req.params.projectId,
      parentTask: req.params.taskId,
    })
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email")
      .sort({ position: 1 });

    res.json({
      success: true,
      count: children.length,
      data: children,
    });
  } catch (error) {
    console.error("Get task children error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching child tasks",
      error: error.message,
    });
  }
};

// @desc    Get project analytics
// @route   GET /api/teams/:teamId/projects/:projectId/analytics
// @access  Private
exports.getProjectAnalytics = async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Get all tasks for the project
    const tasks = await Task.find({ project: projectId });

    // Task count by status
    const statusCounts = {};
    tasks.forEach(task => {
      statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;
    });

    // Task count by work item type
    const typeCounts = {};
    tasks.forEach(task => {
      const type = task.workItemType || 'task';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    // Task count by priority
    const priorityCounts = {};
    tasks.forEach(task => {
      priorityCounts[task.priority] = (priorityCounts[task.priority] || 0) + 1;
    });

    // Sprint velocity (last 5 completed sprints)
    const completedSprints = await Sprint.find({
      project: projectId,
      status: 'completed',
    })
      .sort({ actualEndDate: -1 })
      .limit(5);

    const velocity = completedSprints.map(sprint => ({
      name: sprint.name,
      completedPoints: sprint.metrics?.completedStoryPoints || 0,
      totalPoints: sprint.metrics?.totalStoryPoints || 0,
      completedTasks: sprint.metrics?.completedTasks || 0,
    })).reverse();

    // Completed item count
    const completedTasksCount = tasks.filter((t) => !!t.completedAt).length;

    // Average cycle time (completed tasks with start and completion dates)
    const completedTasks = tasks.filter(t => t.completedAt && t.startDate);
    let avgCycleTime = 0;
    if (completedTasks.length > 0) {
      const totalCycleTime = completedTasks.reduce((sum, task) => {
        return sum + (new Date(task.completedAt) - new Date(task.startDate)) / (1000 * 60 * 60 * 24);
      }, 0);
      avgCycleTime = Math.round((totalCycleTime / completedTasks.length) * 10) / 10;
    }

    res.json({
      success: true,
      data: {
        totalTasks: tasks.length,
        statusCounts,
        typeCounts,
        priorityCounts,
        velocity,
        avgCycleTime,
        completedTasks: completedTasksCount,
        backlogTasks: tasks.filter((t) => !t.sprint).length,
      },
    });
  } catch (error) {
    console.error("Get project analytics error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching analytics",
      error: error.message,
    });
  }
};

// @desc    Get full ancestry chain for a task (for breadcrumb)
// @route   GET /api/teams/:teamId/projects/:projectId/tasks/:taskId/ancestry
// @access  Private
exports.getTaskAncestry = async (req, res) => {
  try {
    const ancestors = [];
    let currentId = req.params.taskId;
    const visited = new Set();

    while (currentId && !visited.has(currentId.toString())) {
      visited.add(currentId.toString());
      const task = await Task.findById(currentId)
        .select("title workItemType parentTask _id")
        .lean();
      if (!task) break;
      ancestors.unshift(task);
      currentId = task.parentTask;
    }

    res.json({ success: true, data: ancestors });
  } catch (error) {
    console.error("Get task ancestry error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching task ancestry",
      error: error.message,
    });
  }
};

// @desc    Get progress rollup for a parent task
// @route   GET /api/teams/:teamId/projects/:projectId/tasks/:taskId/progress
// @access  Private
exports.getTaskProgress = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    const workflowStatuses = project?.settings?.workflowStatuses || [];
    const completedStatusIds = workflowStatuses
      .filter((s) => s.category === "completed")
      .map((s) => s.id);

    const deep = String(req.query.deep || '').toLowerCase() === 'true';

    let tasksToMeasure = [];

    if (!deep) {
      tasksToMeasure = await Task.find({
        project: req.params.projectId,
        parentTask: req.params.taskId,
      })
        .select('status')
        .lean();
    } else {
      const allTasks = await Task.find({ project: req.params.projectId })
        .select('_id parentTask status')
        .lean();

      const childrenByParent = new Map();
      allTasks.forEach((task) => {
        if (!task.parentTask) return;
        const parentKey = task.parentTask.toString();
        if (!childrenByParent.has(parentKey)) {
          childrenByParent.set(parentKey, []);
        }
        childrenByParent.get(parentKey).push(task);
      });

      const queue = [...(childrenByParent.get(req.params.taskId.toString()) || [])];

      while (queue.length > 0) {
        const current = queue.shift();
        tasksToMeasure.push(current);
        const nested = childrenByParent.get(current._id.toString()) || [];
        queue.push(...nested);
      }
    }

    const total = tasksToMeasure.length;
    const completed = tasksToMeasure.filter(
      (task) =>
        completedStatusIds.includes(task.status) ||
        ["completed", "resolved", "closed"].includes(task.status),
    ).length;

    res.json({
      success: true,
      data: {
        total,
        completed,
        percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
      },
    });
  } catch (error) {
    console.error("Get task progress error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching task progress",
      error: error.message,
    });
  }
};
