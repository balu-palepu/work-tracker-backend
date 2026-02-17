const express = require("express");
const router = express.Router({ mergeParams: true });
const { protect } = require("../middleware/auth");
const { setTeamContext } = require("../middleware/teamContext");
const {
  getNewsletters,
  getNewsletter,
  createNewsletter,
  updateNewsletter,
  deleteNewsletter,
} = require("../controllers/newsletterController");

router.use(protect);
router.use(setTeamContext);

router.route("/")
  .get(getNewsletters)
  .post(createNewsletter);

router.route("/:newsletterId")
  .get(getNewsletter)
  .put(updateNewsletter)
  .delete(deleteNewsletter);

module.exports = router;
