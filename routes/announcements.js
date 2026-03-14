const express = require('express');
const router = express.Router({ mergeParams: true });
const { protect } = require('../middleware/auth');
const { setTeamContext } = require('../middleware/teamContext');
const {
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  togglePin,
} = require('../controllers/announcementController');

router.use(protect, setTeamContext);

router.get('/', getAnnouncements);
router.post('/', createAnnouncement);
router.put('/:id', updateAnnouncement);
router.delete('/:id', deleteAnnouncement);
router.post('/:id/pin', togglePin);

module.exports = router;
