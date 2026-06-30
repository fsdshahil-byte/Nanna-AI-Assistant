const Reminder = require("../models/Reminder");
const AlarmTimer = require("../models/AlarmTimer");
const Task = require("../models/Task");
const User = require("../models/User");
const { sendEmail, sendSms, sendTelegram } = require("./communicationService");
const { createNotification } = require("./notificationService");

const getNow = () => new Date();

const sendReminderChannel = async (reminder, user) => {
  const body = reminder.notes || `Reminder: ${reminder.title}`;

  if (reminder.channel === "email") {
    return sendEmail({ to: user.email, subject: reminder.title, text: body });
  }

  if (reminder.channel === "sms") {
    return sendSms({ to: user.phone, text: body });
  }

  if (reminder.channel === "telegram") {
    return sendTelegram({ to: user.telegramChatId, text: body });
  }

  return {
    provider: "nanna_in_app",
    status: "sent",
    message: "Reminder shown inside NANNA.",
  };
};

const processDueReminders = async () => {
  const now = getNow();
  const reminders = await Reminder.find({ status: "scheduled", remindAt: { $lte: now } }).limit(50);
  if (!reminders.length) return;

  for (const reminder of reminders) {
    try {
      const user = await User.findById(reminder.user);
      const result = user
        ? await sendReminderChannel(reminder, user)
        : { status: "failed", message: "User not found." };

      reminder.status = result.status === "failed" ? "failed" : "sent";
      reminder.sentAt = now;
      await reminder.save();
      await createNotification({
        user,
        title: reminder.title,
        body: reminder.notes || `Reminder: ${reminder.title}`,
        channel: reminder.channel === "telegram" ? "telegram" : "in_app",
        status: result.status === "failed" ? "failed" : "unread",
        metadata: { reminder: reminder._id, result, alertType: "reminder_due", ring: true },
        deliverTelegram: false,
      });
    } catch (err) {
      console.error("Failed to process due reminder:", err?.message || err);
    }
  }
};

const processDueAlarms = async () => {
  const now = getNow();
  const alarms = await AlarmTimer.find({ status: "scheduled", triggerAt: { $lte: now } }).limit(50);
  if (!alarms.length) return;

  for (const alarm of alarms) {
    try {
      alarm.status = "completed";
      await alarm.save();
      const user = await User.findById(alarm.user);
      await createNotification({
        user: user || alarm.user,
        title: alarm.label || "Alarm",
        body: alarm.type === "timer" ? `Timer finished: ${alarm.label}.` : `Alarm sounding: ${alarm.label}.`,
        channel: "telegram",
        status: "unread",
        metadata: { alarm: alarm._id, alertType: `${alarm.type}_due`, ring: true },
      });
    } catch (err) {
      console.error("Failed to process due alarm:", err?.message || err);
    }
  }
};

const processDueTasks = async () => {
  const now = getNow();
  const tasks = await Task.find({
    status: "pending",
    dueAt: { $lte: now },
    "notificationState.deadlineSent": { $ne: true },
  }).limit(50);
  if (!tasks.length) return;

  for (const task of tasks) {
    try {
      const user = await User.findById(task.user);
      await createNotification({
        user: user || task.user,
        title: "Task deadline",
        body: `${task.title} is due now.`,
        channel: "telegram",
        status: "unread",
        metadata: { task: task._id, alertType: "task_deadline", ring: true },
      });
      task.notificationState = { ...(task.notificationState || {}), deadlineSent: true, deadlineSentAt: now };
      await task.save();
    } catch (err) {
      console.error("Failed to process due task:", err?.message || err);
    }
  }
};

const startScheduler = () => {
  let running = false;

  const execute = async () => {
    if (running) return;
    running = true;

    try {
      await processDueReminders();
      await processDueAlarms();
      await processDueTasks();
    } catch (error) {
      console.error("Reminder scheduler error:", error?.message || error);
    } finally {
      running = false;
      setTimeout(execute, 1000);
    }
  };

  execute();
  console.log("Reminder scheduler started and will check every second.");
};

module.exports = { startScheduler, processDueReminders, processDueAlarms, processDueTasks };
