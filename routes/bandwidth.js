const express = require('express');
const router = express.Router({ mergeParams: true }); // mergeParams to access teamId
const { protect } = require('../middleware/auth');
const { setTeamContext } = require('../middleware/teamContext');
const { requireTeamPermission } = require('../middleware/permissions');
const {
  getMyReports,
  getAllReports,
  getPendingReports,
  createReport,
  getReport,
  updateReport,
  deleteReport,
  submitReport,
  approveReport,
  rejectReport,
  getBandwidthSummary
} = require('../controllers/bandwidthController');

// All routes require authentication and team context
router.use(protect);
router.use(setTeamContext);

// User routes
router.get('/my', getMyReports);

// Admin routes
router.get(
  '/summary',
  requireTeamPermission('VIEW_REPORTS'),
  getBandwidthSummary
);

router.get(
  '/pending',
  requireTeamPermission('VIEW_REPORTS'),
  getPendingReports
);

router.get(
  '/',
  requireTeamPermission('VIEW_REPORTS'),
  getAllReports
);

// Report CRUD
router.post('/', createReport);

router.route('/:reportId')
  .get(getReport)
  .put(updateReport)
  .delete(deleteReport);

// Report workflow
router.post('/:reportId/submit', submitReport);

router.post(
  '/:reportId/approve',
  requireTeamPermission('VIEW_REPORTS'),
  approveReport
);

router.post(
  '/:reportId/reject',
  requireTeamPermission('VIEW_REPORTS'),
  rejectReport
);

module.exports = router;
