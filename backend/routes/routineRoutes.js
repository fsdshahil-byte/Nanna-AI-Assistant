const express = require("express");
const {
  getRoutines,
  createRoutine,
  runRoutineById,
} = require("../controllers/routineController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.route("/").get(getRoutines).post(createRoutine);
router.post("/:id/run", runRoutineById);

module.exports = router;
