const Project = require("../models/Project");
const ProjectMember = require("../models/ProjectMember");
const Task = require("../models/Tasks");
const TeamMember = require("../models/TeamMember");
const Notification = require("../models/Notification");
const Sprint = require("../models/Sprint");
const Team = require("../models/Team");
const { createNotification } = require("./notificationController");

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

    // Create project
    const project = await Project.create({
      ...req.body,
      team: teamId,
      createdBy: req.user._id,
      teamLead: teamLeadId || null,
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

    // Get position for new task
    const maxPosition = await Task.findOne({
      project: req.params.projectId,
      status: req.body.status || "todo",
    }).sort({ position: -1 });

    const assignedTo = req.body.assignedTo || null;
    const mentions = Array.isArray(req.body.mentions) ? req.body.mentions : [];

    const task = await Task.create({
      ...req.body,
      assignedTo,
      assignedBy: assignedTo ? req.user._id : undefined,
      project: req.params.projectId,
      team: project.team,
      createdBy: req.user._id,
      position: maxPosition ? maxPosition.position + 1 : 0,
    });

    const populatedTask = await Task.findById(task._id)
      .populate("assignedTo", "name email")
      .populate("createdBy", "name email");

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
      .populate("createdBy", "name email");

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
    const { status, position } = req.body;

    const task = await Task.findById(req.params.taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    task.status = status;
    if (position !== undefined) {
      task.position = position;
    }

    await task.save();

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
