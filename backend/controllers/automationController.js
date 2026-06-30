const AutomationJob = require("../models/AutomationJob");
const Notification = require("../models/Notification");
const asyncHandler = require("../utils/asyncHandler");
const { createAndRunJob, executeAutomationJob } = require("../services/automationExecutor");
const { checkTelegramHealth, getIntegrationStatus, getTelegramWebhookInfo } = require("../services/communicationService");
const { emitDashboardChanged } = require("../services/realtimeService");

const getAutomationJobs = asyncHandler(async (req, res) => {
  const jobs = await AutomationJob.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json({ jobs });
});

const createAutomationJob = asyncHandler(async (req, res) => {
  const { type, payload, scheduledFor, runNow = true } = req.body;

  if (!type) {
    res.status(400);
    throw new Error("Automation job type is required");
  }

  const job = runNow
    ? await createAndRunJob({ user: req.user, type, payload, scheduledFor })
    : await AutomationJob.create({
        user: req.user._id,
        type,
        payload,
        scheduledFor,
      });

  res.status(201).json({ message: "Automation job queued successfully", job });
});

const runAutomationJob = asyncHandler(async (req, res) => {
  const job = await AutomationJob.findOne({ _id: req.params.id, user: req.user._id });
  if (!job) {
    res.status(404);
    throw new Error("Automation job not found");
  }

  job.status = "processing";
  await job.save();

  const updatedJob = await executeAutomationJob({ job, user: req.user });
  res.json({ message: "Automation job processed", job: updatedJob });
});

const getNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
  res.json({ notifications });
});

const markNotificationRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { status: "read" },
    { returnDocument: "after" }
  );

  if (!notification) {
    res.status(404);
    throw new Error("Notification not found");
  }

  emitDashboardChanged(req.user._id, {
    reason: "notification_read",
    notificationId: notification._id.toString(),
  });

  res.json({ notification });
});

const getIntegrations = asyncHandler(async (req, res) => {
  const integrations = getIntegrationStatus();
  if (integrations.telegram.configured) {
    const health = await checkTelegramHealth();
    integrations.telegram = { ...integrations.telegram, ...health };
    if (health.healthy) {
      const webhook = await getTelegramWebhookInfo();
      integrations.telegram.webhook = webhook.webhook || null;
      integrations.telegram.webhookConfigured = Boolean(webhook.webhook?.url);
    }
  } else {
    integrations.telegram = { ...integrations.telegram, healthy: false, message: integrations.telegram.requiredEnv.join(", ") + " required" };
  }
  res.json({ integrations });
});

module.exports = {
  getAutomationJobs,
  createAutomationJob,
  runAutomationJob,
  getNotifications,
  markNotificationRead,
  getIntegrations,
};
