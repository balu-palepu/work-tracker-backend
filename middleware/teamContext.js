const Team = require('../models/Team');
const TeamMember = require('../models/TeamMember');

/**
 * Middleware to set team context on request
 * Verifies that the team exists and user is an active member
 * Attaches team and teamMembership to req object
 */
const setTeamContext = async (req, res, next) => {
  try {
    const teamId = req.params.teamId;

    if (!teamId) {
      return res.status(400).json({
        success: false,
        message: 'Team ID is required'
      });
    }

    // Verify team exists
    const team = await Team.findById(teamId);

    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    // Check if team is active
    if (!team.isActive) {
      return res.status(403).json({
        success: false,
        message: 'This team is no longer active'
      });
    }

    // Verify user is an active member of the team
    const membership = await TeamMember.findOne({
      team: teamId,
      user: req.user._id,
      status: 'active'
    }).populate('user', 'name email');

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this team'
      });
    }

    // Attach to request for use in subsequent middleware/controllers
    req.team = team;
    req.teamMembership = membership;

    next();
  } catch (error) {
    console.error('Team context middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error verifying team membership',
      error: error.message
    });
  }
};

/**
 * Middleware to verify user is team owner
 */
const requireTeamOwner = async (req, res, next) => {
  try {
    if (!req.team || !req.teamMembership) {
      return res.status(403).json({
        success: false,
        message: 'Team context not set'
      });
    }

    // Check if user is the team owner
    if (req.team.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the team owner can perform this action'
      });
    }

    next();
  } catch (error) {
    console.error('Team owner check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error verifying team ownership',
      error: error.message
    });
  }
};

/**
 * Middleware to verify user is team owner or admin
 */
const requireTeamOwnerOrAdmin = async (req, res, next) => {
  try {
    if (!req.team || !req.teamMembership) {
      return res.status(403).json({
        success: false,
        message: 'Team context not set'
      });
    }

    const isOwner = req.team.owner.toString() === req.user._id.toString();
    const isAdmin = req.teamMembership.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only the team owner or admin can perform this action'
      });
    }

    next();
  } catch (error) {
    console.error('Team owner/admin check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error verifying permissions',
      error: error.message
    });
  }
};

/**
 * Middleware to verify user is team admin
 */
const requireTeamAdmin = async (req, res, next) => {
  try {
    if (!req.teamMembership) {
      return res.status(403).json({
        success: false,
        message: 'Team membership not found'
      });
    }

    // Check if user is admin
    if (req.teamMembership.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin privileges required for this action'
      });
    }

    next();
  } catch (error) {
    console.error('Team admin check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error verifying admin privileges',
      error: error.message
    });
  }
};

module.exports = {
  setTeamContext,
  requireTeamOwner,
  requireTeamAdmin,
  requireTeamOwnerOrAdmin
};
