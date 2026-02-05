const express = require('express');
const router = express.Router({ mergeParams: true }); // mergeParams to access teamId
const { protect } = require('../middleware/auth');
const { setTeamContext } = require('../middleware/teamContext');
const { requireProjectPermission } = require('../middleware/permissions');
const {
  getProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
  getProjectTasks,
  createTask,
  getTask,
  updateTask,
  deleteTask,
  updateTaskStatus,
  addTaskComment,
  assignTeamLead,
  getProjectsByTeamLead
} = require('../controllers/projectController');

// All routes require authentication and team context
router.use(protect);
router.use(setTeamContext);

// Project routes
router.route('/')
  .get(getProjects)
  .post(createProject);

router.route('/:id')
  .get(getProject)
  .put(requireProjectPermission('EDIT_PROJECT'), updateProject)
  .delete(requireProjectPermission('DELETE_PROJECT'), deleteProject);

// Team lead management routes
router.put('/:id/team-lead', requireProjectPermission('EDIT_PROJECT'), assignTeamLead);
router.get('/team-lead/:userId', getProjectsByTeamLead);

// Task routes
router.route('/:projectId/tasks')
  .get(getProjectTasks)
  .post(createTask);

router.route('/:projectId/tasks/:taskId')
  .get(getTask)
  .put(updateTask)
  .delete(requireProjectPermission('DELETE_TASKS'), deleteTask);

router.patch('/:projectId/tasks/:taskId/status', updateTaskStatus);
router.post('/:projectId/tasks/:taskId/comments', addTaskComment);

module.exports = router;
