const express = require("express");
const { getAlarms, createAlarm } = require("../controllers/alarmController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.route("/").get(getAlarms).post(createAlarm);

module.exports = router;
