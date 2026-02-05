const express = require('express');
const router = express.Router({ mergeParams: true }); // mergeParams to access teamId and projectId
const { protect } = require('../middleware/auth');
const { setTeamContext } = require('../middleware/teamContext');
const { requireProjectPermission } = require('../middleware/permissions');
const {
  getSprints,
  createSprint,
  getSprint,
  updateSprint,
  deleteSprint,
  startSprint,
  completeSprint,
  cancelSprint,
  getBurndownData,
  submitRetrospective,
  getBacklog,
  addTasksToSprint,
  removeTaskFromSprint
} = require('../controllers/sprintController');

// All routes require authentication and team context
router.use(protect);
router.use(setTeamContext);

// Backlog routes
router.get('/backlog', getBacklog);

// Sprint CRUD
router.route('/')
  .get(getSprints)
  .post(requireProjectPermission('MANAGE_SPRINTS'), createSprint);

router.route('/:sprintId')
  .get(getSprint)
  .put(requireProjectPermission('MANAGE_SPRINTS'), updateSprint)
  .delete(requireProjectPermission('MANAGE_SPRINTS'), deleteSprint);

// Sprint lifecycle
router.post(
  '/:sprintId/start',
  requireProjectPermission('MANAGE_SPRINTS'),
  startSprint
);

router.post(
  '/:sprintId/complete',
  requireProjectPermission('MANAGE_SPRINTS'),
  completeSprint
);

router.post(
  '/:sprintId/cancel',
  requireProjectPermission('MANAGE_SPRINTS'),
  cancelSprint
);

// Sprint analytics
router.get('/:sprintId/burndown', getBurndownData);

// Sprint retrospective
router.post(
  '/:sprintId/retrospective',
  requireProjectPermission('MANAGE_SPRINTS'),
  submitRetrospective
);

// Sprint task management
router.post(
  '/:sprintId/tasks',
  requireProjectPermission('MANAGE_SPRINTS'),
  addTasksToSprint
);

router.delete(
  '/:sprintId/tasks/:taskId',
  requireProjectPermission('MANAGE_SPRINTS'),
  removeTaskFromSprint
);

module.exports = router;
