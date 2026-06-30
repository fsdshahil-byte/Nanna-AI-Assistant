const AlarmTimer = require("../models/AlarmTimer");
const asyncHandler = require("../utils/asyncHandler");
const { createNotification } = require("../services/notificationService");

const getAlarms = asyncHandler(async (req, res) => {
  const alarms = await AlarmTimer.find({ user: req.user._id }).sort({ triggerAt: 1 });
  res.json({ alarms });
});

const createAlarm = asyncHandler(async (req, res) => {
  const { type, label, triggerAt, durationSeconds } = req.body;
  if (!type) {
    res.status(400);
    throw new Error("Alarm/timer type is required");
  }

  let scheduledAt = triggerAt ? new Date(triggerAt) : null;
  if (type === "timer" && !scheduledAt && durationSeconds) {
    scheduledAt = new Date(Date.now() + Number(durationSeconds) * 1000);
  }

  if (!scheduledAt || Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
    res.status(400);
    throw new Error("Choose a valid future time or timer duration");
  }

  const alarm = await AlarmTimer.create({
    user: req.user._id,
    type,
    label,
    triggerAt: scheduledAt,
    durationSeconds: type === "timer" ? durationSeconds || Math.max(1, Math.round((scheduledAt.getTime() - Date.now()) / 1000)) : 0,
  });

  await createNotification({
    user: req.user,
    title: `${type} scheduled`,
    body: `${label || "NANNA alert"} at ${scheduledAt.toLocaleString("en-IN", { timeZone: req.user.timezone || "Asia/Kolkata" })}`,
    channel: "telegram",
    status: "unread",
    metadata: { alarm: alarm._id },
  });

  res.status(201).json({ message: `${type} scheduled successfully`, alarm });
});

module.exports = { getAlarms, createAlarm };
