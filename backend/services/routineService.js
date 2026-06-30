const Routine = require("../models/Routine");
const SmartDevice = require("../models/SmartDevice");
const Task = require("../models/Task");
const Reminder = require("../models/Reminder");
const User = require("../models/User");
const { createNotification } = require("./notificationService");

const runRoutine = async ({ userId, phrase }) => {
  const routine = await Routine.findOne({
    user: userId,
    enabled: true,
    triggerPhrase: new RegExp(phrase, "i"),
  });

  if (!routine) {
    return { ok: false, response: "I could not find that routine." };
  }

  const results = [];

  for (const action of routine.actions) {
    if (action.type === "device") {
      const device = await SmartDevice.findOne({
        user: userId,
        name: new RegExp(action.payload.deviceName || "", "i"),
      });
      if (device) {
        if (action.payload.power !== undefined) device.state.power = Boolean(action.payload.power);
        await device.save();
        results.push(`${device.name} updated`);
      }
    }

    if (action.type === "task") {
      const task = await Task.create({ user: userId, title: action.payload.title || "Routine task" });
      results.push(`task created: ${task.title}`);
    }

    if (action.type === "reminder") {
      const remindAt = action.payload.remindAt
        ? new Date(action.payload.remindAt)
        : new Date(Date.now() + 60 * 60 * 1000);
      const reminder = await Reminder.create({
        user: userId,
        title: action.payload.title || "Routine reminder",
        remindAt,
      });
      results.push(`reminder created: ${reminder.title}`);
    }

    if (action.type === "say") {
      results.push(action.payload.text || "Done");
    }
  }

  return {
    ok: true,
    routine,
    results,
    response: `I ran ${routine.name}. ${results.join(". ")}`,
  };
};

const runRoutineWithNotification = async ({ userId, phrase }) => {
  const result = await runRoutine({ userId, phrase });
  const user = await User.findById(userId);
  if (user) {
    await createNotification({
      user,
      title: result.ok ? `Routine ran: ${result.routine.name}` : "Routine not found",
      body: result.response,
      channel: "telegram",
      status: result.ok ? "sent" : "failed",
      metadata: { phrase, routine: result.routine?._id, results: result.results || [] },
    });
  }
  return result;
};

module.exports = { runRoutine, runRoutineWithNotification };
