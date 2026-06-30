const express = require("express");
const {
  getSkills,
  createSkill,
  updateSkill,
  deleteSkill,
} = require("../controllers/skillController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.route("/").get(getSkills).post(createSkill);
router.route("/:id").put(updateSkill).delete(deleteSkill);

module.exports = router;
