const ProjectMember = require('../models/ProjectMember');
const Project = require('../models/Project');
const User = require('../models/User');
const TeamMember = require('../models/TeamMember');
const { createNotification } = require('./notificationController');

/**
 * @desc    Get all members for a project
 * @route   GET /api/teams/:teamId/projects/:projectId/members
 * @access  Private
 */
exports.getProjectMembers = async (req, res) => {
  try {
    const { projectId } = req.params;

    const members = await ProjectMember.find({ project: projectId })
      .populate('user', 'name email createdAt')
      .populate('addedBy', 'name email')
      .sort('-addedAt');

    res.status(200).json({
      success: true,
      count: members.length,
      data: members
    });
  } catch (error) {
    console.error('Get project members error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving project members',
      error: error.message
    });
  }
};

/**
 * @desc    Add member to project
 * @route   POST /api/teams/:teamId/projects/:projectId/members
 * @access  Private (Project Owner/Manager)
 */
exports.addProjectMember = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { userId, role, workload } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Verify project exists and belongs to team
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    if (project.team.toString() !== req.params.teamId) {
      return res.status(403).json({
        success: false,
        message: 'Project does not belong to this team'
      });
    }

    // Verify user exists and is a team member
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify user is an active team member
    const teamMember = await TeamMember.findOne({
      team: req.params.teamId,
      user: userId,
      status: 'active'
    });

    if (!teamMember) {
      return res.status(400).json({
        success: false,
        message: 'User is not an active member of this team'
      });
    }

    // Check if user is already a member
    const existingMember = await ProjectMember.findOne({
      project: projectId,
      user: userId
    });

    if (existingMember) {
      return res.status(400).json({
        success: false,
        message: 'User is already a project member'
      });
    }

    // Create project membership
    const member = await ProjectMember.create({
      project: projectId,
      user: userId,
      role: role || 'contributor',
      workload: workload || 0,
      addedBy: req.user._id
    });

    // Populate user data
    await member.populate('user', 'name email');

    // Create notification
    if (userId.toString() !== req.user._id.toString()) {
      await createNotification({
        recipient: userId,
        team: req.params.teamId,
        type: 'project_added',
        title: 'Added to Project',
        message: `You have been added to project "${project.name}"`,
        relatedProject: project._id,
        actor: req.user._id,
        actionUrl: `/teams/${req.params.teamId}/projects/${project._id}`
      });
    }

    res.status(201).json({
      success: true,
      data: member,
      message: 'Member added successfully'
    });
  } catch (error) {
    console.error('Add project member error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding project member',
      error: error.message
    });
  }
};

/**
 * @desc    Update project member role
 * @route   PUT /api/teams/:teamId/projects/:projectId/members/:userId
 * @access  Private (Project Owner/Manager)
 */
exports.updateProjectMember = async (req, res) => {
  try {
    const { projectId, userId } = req.params;
    const { role, workload } = req.body;

    const member = await ProjectMember.findOne({
      project: projectId,
      user: userId
    }).populate('user', 'name email');

    if (!member) {
      return res.status(404).json({
        success: false,
        message: 'Project member not found'
      });
    }

    // Update role and workload
    if (role) member.role = role;
    if (workload !== undefined) member.workload = workload;

    await member.save();

    res.status(200).json({
      success: true,
      data: member,
      message: 'Member updated successfully'
    });
  } catch (error) {
    console.error('Update project member error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating project member',
      error: error.message
    });
  }
};

/**
 * @desc    Remove member from project
 * @route   DELETE /api/teams/:teamId/projects/:projectId/members/:userId
 * @access  Private (Project Owner/Manager)
 */
exports.removeProjectMember = async (req, res) => {
  try {
    const { projectId, userId } = req.params;

    const member = await ProjectMember.findOne({
      project: projectId,
      user: userId
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        message: 'Project member not found'
      });
    }

    // Prevent removing project owner
    if (member.role === 'owner') {
      return res.status(403).json({
        success: false,
        message: 'Cannot remove project owner'
      });
    }

    await member.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Member removed successfully'
    });
  } catch (error) {
    console.error('Remove project member error:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing project member',
      error: error.message
    });
  }
};

/**
 * @desc    Get user's project membership
 * @route   GET /api/teams/:teamId/projects/:projectId/members/me
 * @access  Private
 */
exports.getMyMembership = async (req, res) => {
  try {
    const { projectId } = req.params;

    const member = await ProjectMember.findOne({
      project: projectId,
      user: req.user._id
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        message: 'You are not a member of this project'
      });
    }

    res.status(200).json({
      success: true,
      data: member
    });
  } catch (error) {
    console.error('Get my membership error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving membership',
      error: error.message
    });
  }
};

/**
 * @desc    Bulk assign members to project
 * @route   POST /api/teams/:teamId/projects/:projectId/members/bulk
 * @access  Private (Project Owner/Manager)
 */
exports.bulkAddProjectMembers = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { members } = req.body; // Array of { userId, role, workload }

    if (!members || !Array.isArray(members) || members.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Members array is required'
      });
    }

    // Verify project exists and belongs to team
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    if (project.team.toString() !== req.params.teamId) {
      return res.status(403).json({
        success: false,
        message: 'Project does not belong to this team'
      });
    }

    const addedMembers = [];
    const errors = [];

    for (const memberData of members) {
      try {
        const { userId, role, workload } = memberData;

        if (!userId) {
          errors.push({ userId, error: 'User ID is required' });
          continue;
        }

        // Check if user is already a member
        const existingMember = await ProjectMember.findOne({
          project: projectId,
          user: userId
        });

        if (existingMember) {
          errors.push({ userId, error: 'User is already a project member' });
          continue;
        }

        // Verify user is an active team member
        const teamMember = await TeamMember.findOne({
          team: req.params.teamId,
          user: userId,
          status: 'active'
        });

        if (!teamMember) {
          errors.push({ userId, error: 'User is not an active member of this team' });
          continue;
        }

        // Create project membership
        const member = await ProjectMember.create({
          project: projectId,
          user: userId,
          role: role || 'contributor',
          workload: workload || 0,
          addedBy: req.user._id
        });

        await member.populate('user', 'name email');
        addedMembers.push(member);

        // Create notification
        if (userId.toString() !== req.user._id.toString()) {
          await createNotification({
            recipient: userId,
            team: req.params.teamId,
            type: 'project_added',
            title: 'Added to Project',
            message: `You have been added to project "${project.name}"`,
            relatedProject: project._id,
            actor: req.user._id,
            actionUrl: `/teams/${req.params.teamId}/projects/${project._id}`
          });
        }
      } catch (error) {
        errors.push({ userId: memberData.userId, error: error.message });
      }
    }

    res.status(201).json({
      success: true,
      data: {
        added: addedMembers,
        errors: errors.length > 0 ? errors : undefined
      },
      message: `Added ${addedMembers.length} member(s)${errors.length > 0 ? `, ${errors.length} error(s)` : ''}`
    });
  } catch (error) {
    console.error('Bulk add project members error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding project members',
      error: error.message
    });
  }
};
