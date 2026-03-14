const express = require('express');
const router = express.Router({ mergeParams: true });
const { protect } = require('../middleware/auth');
const { setTeamContext } = require('../middleware/teamContext');
const {
  getCatalog,
  getCatalogEntry,
  createCatalogEntry,
  updateCatalogEntry,
  deleteCatalogEntry,
} = require('../controllers/projectCatalogController');

router.use(protect, setTeamContext);

// XSS is already skipped for newsletter routes in server.js.
// We'll also skip for catalog (one-pager contains rich HTML).
router.get('/', getCatalog);
router.post('/', createCatalogEntry);
router.get('/:id', getCatalogEntry);
router.put('/:id', updateCatalogEntry);
router.delete('/:id', deleteCatalogEntry);

module.exports = router;
