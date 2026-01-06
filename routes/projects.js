const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
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
  updateTaskStatus
} = require('../controllers/projectController');

// Project routes
router.route('/')
  .get(protect, getProjects)
  .post(protect, createProject);

router.route('/:id')
  .get(protect, getProject)
  .put(protect, updateProject)
  .delete(protect, deleteProject);

// Task routes
router.route('/:projectId/tasks')
  .get(protect, getProjectTasks)
  .post(protect, createTask);

router.route('/:projectId/tasks/:taskId')
  .get(protect, getTask)
  .put(protect, updateTask)
  .delete(protect, deleteTask);

router.patch('/:projectId/tasks/:taskId/status', protect, updateTaskStatus);

module.exports = router;
