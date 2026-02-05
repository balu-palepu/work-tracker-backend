const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/requireAdmin');
const {
  setTeamContext,
  requireTeamOwner,
  requireTeamOwnerOrAdmin,
  requireTeamAdmin
} = require('../middleware/teamContext');
const { requireTeamPermission } = require('../middleware/permissions');
const {
  createTeam,
  getTeams,
  getTeam,
  updateTeam,
  deleteTeam,
  getTeamMembers,
  getAvailableUsers,
  addTeamMember,
  updateTeamMember,
  removeTeamMember,
  getTeamSettings,
  updateTeamSettings
} = require('../controllers/teamController');

// Team routes (no team context needed)
// Only admins can create teams
router.post('/', protect, requireAdmin, createTeam);
router.get('/', protect, getTeams);

// Routes that require team context
router.use('/:teamId', protect, setTeamContext);

// Team CRUD operations
router.get('/:teamId', getTeam);
router.put('/:teamId', requireTeamPermission('MANAGE_SETTINGS'), updateTeam);
router.delete('/:teamId', requireTeamOwnerOrAdmin, deleteTeam);

// Team member management
router.get('/:teamId/members', getTeamMembers);
router.get('/:teamId/available-users', getAvailableUsers);
router.post(
  '/:teamId/members',
  requireTeamPermission('INVITE_MEMBERS'),
  addTeamMember
);
router.put(
  '/:teamId/members/:userId',
  requireTeamAdmin,
  updateTeamMember
);
router.delete(
  '/:teamId/members/:userId',
  requireTeamPermission('REMOVE_MEMBERS'),
  removeTeamMember
);

// Team settings
router.get('/:teamId/settings', getTeamSettings);
router.put(
  '/:teamId/settings',
  requireTeamPermission('MANAGE_SETTINGS'),
  updateTeamSettings
);

module.exports = router;
