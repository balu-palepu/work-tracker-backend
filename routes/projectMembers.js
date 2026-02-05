const express = require('express');
const router = express.Router({ mergeParams: true }); // mergeParams to access teamId and projectId
const { protect } = require('../middleware/auth');
const { setTeamContext } = require('../middleware/teamContext');
const { requireProjectPermission } = require('../middleware/permissions');
const {
  getProjectMembers,
  addProjectMember,
  updateProjectMember,
  removeProjectMember,
  getMyMembership,
  bulkAddProjectMembers
} = require('../controllers/projectMemberController');

// All routes require authentication and team context
router.use(protect);
router.use(setTeamContext);

// Get my membership for this project
router.get('/me', getMyMembership);

// Project member management
router.get('/', getProjectMembers);

router.post(
  '/',
  requireProjectPermission('INVITE_MEMBERS'),
  addProjectMember
);

router.post(
  '/bulk',
  requireProjectPermission('INVITE_MEMBERS'),
  bulkAddProjectMembers
);

router.put(
  '/:userId',
  requireProjectPermission('INVITE_MEMBERS'),
  updateProjectMember
);

router.delete(
  '/:userId',
  requireProjectPermission('REMOVE_MEMBERS'),
  removeProjectMember
);

module.exports = router;
