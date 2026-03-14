const express = require('express');
const router = express.Router({ mergeParams: true });
const { protect } = require('../middleware/auth');
const { setTeamContext } = require('../middleware/teamContext');
const {
  getResourceOverview,
  assignResource,
  removeAllocation,
  getDirectReports,
} = require('../controllers/resourceController');

router.use(protect, setTeamContext);

router.get('/', getResourceOverview);
router.post('/assign', assignResource);
router.post('/remove-allocation', removeAllocation);
router.get('/direct-reports/:managerId', getDirectReports);

module.exports = router;
