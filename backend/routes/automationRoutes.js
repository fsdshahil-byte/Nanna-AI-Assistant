const express = require("express");
const {
  getAutomationJobs,
  createAutomationJob,
  runAutomationJob,
  getNotifications,
  markNotificationRead,
  getIntegrations,
} = require("../controllers/automationController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.route("/jobs").get(getAutomationJobs).post(createAutomationJob);
router.post("/jobs/:id/run", runAutomationJob);
router.get("/integrations", getIntegrations);
router.get("/notifications", getNotifications);
router.put("/notifications/:id/read", markNotificationRead);

module.exports = router;
