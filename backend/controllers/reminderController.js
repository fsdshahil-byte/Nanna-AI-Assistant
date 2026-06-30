const Reminder = require("../models/Reminder");
const asyncHandler = require("../utils/asyncHandler");
const { createNotification } = require("../services/notificationService");

const getReminders = asyncHandler(async (req, res) => {
  const reminders = await Reminder.find({ user: req.user._id }).sort({ remindAt: 1 });
  res.json({ reminders });
});

const createReminder = asyncHandler(async (req, res) => {
  const { title, notes, remindAt, channel } = req.body;

  if (!title || !remindAt) {
    res.status(400);
    throw new Error("Reminder title and remindAt are required");
  }

  const scheduledAt = new Date(remindAt);
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
    res.status(400);
    throw new Error("Choose a valid future time for the reminder");
  }

  const reminder = await Reminder.create({
    user: req.user._id,
    title,
    notes,
    remindAt: scheduledAt,
    channel: channel || "in_app",
  });

  await createNotification({
    user: req.user,
    title: "Reminder scheduled",
    body: `${title} at ${scheduledAt.toLocaleString("en-IN", { timeZone: req.user.timezone || "Asia/Kolkata" })}`,
    channel: "in_app",
    status: "unread",
    metadata: { reminder: reminder._id },
  });

  res.status(201).json({ message: "Reminder created successfully", reminder });
});

const updateReminder = asyncHandler(async (req, res) => {
  const reminder = await Reminder.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    req.body,
    { returnDocument: "after", runValidators: true }
  );

  if (!reminder) {
    res.status(404);
    throw new Error("Reminder not found");
  }

  res.json({ message: "Reminder updated successfully", reminder });
});

const deleteReminder = asyncHandler(async (req, res) => {
  const reminder = await Reminder.findOneAndDelete({ _id: req.params.id, user: req.user._id });

  if (!reminder) {
    res.status(404);
    throw new Error("Reminder not found");
  }

  res.json({ message: "Reminder deleted successfully" });
});

module.exports = { getReminders, createReminder, updateReminder, deleteReminder };
