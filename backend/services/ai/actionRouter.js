const Task = require("../../models/Task");
const Reminder = require("../../models/Reminder");
const AutomationJob = require("../../models/AutomationJob");
const AlarmTimer = require("../../models/AlarmTimer");
const VoiceEvent = require("../../models/VoiceEvent");
const { sendEmail, triggerCall } = require("../communicationService");
const { createAndRunJob } = require("../automationExecutor");
const { createNotification } = require("../notificationService");
const { controlDevice } = require("../deviceService");
const { runRoutineWithNotification } = require("../routineService");
const { findMatchingSkill, runSkill } = require("../skillService");

const upsertMemory = (user, key, value) => {
  if (!value) return false;
  const cleanValue = String(value).trim();
  if (!cleanValue) return false;

  const existing = user.memory.find((item) => item.key === key);
  if (existing) {
    existing.value = cleanValue;
  } else {
    user.memory.push({ key, value: cleanValue, source: "user" });
  }
  return true;
};

const stripWakeWord = (message = "") =>
  String(message)
    .replace(/\bhey\s+nanna\b[,\s]*/gi, "")
    .replace(/\bnanna\b[,\s]*/gi, "")
    .replace(/\s+/g, " ")
    .trim();

const extractEmail = (text) => text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";

const cleanMessageText = (message, fallbacks = []) => {
  const cleaned = fallbacks.reduce(
    (value, pattern) => value.replace(pattern, ""),
    stripWakeWord(message).replace(/\b(?:please|kindly)\b/gi, "")
  );
  const quoted = cleaned.match(/["']([^"']{2,})["']/)?.[1];
  if (quoted) return quoted.trim();

  const afterMarker = cleaned.match(/\b(?:saying|that says|message|body|text)\s+(.+)/i)?.[1];
  return (afterMarker || cleaned).trim() || "NANNA notification";
};

const extractPersonalInfo = (text) => {
  const info = {};
  const name = text.match(/\bmy name is\s+([a-z][a-z\s]{1,40}?)(?=\s+i\s|\s+and\b|,|$)/i)?.[1];
  const role = text.match(/\b(?:i am|i'm)\s+(?:a|an)?\s*([^,.]+?(?:developer|engineer|designer|student|intern|manager|lead))/i)?.[1];
  const company = text.match(/\b(?:work at|work as .*? at|intern at)\s+([^,.]+?)(?=\s+(?:and|in|at)\b|,|$)/i)?.[1];
  const location =
    text.match(/,\s*([a-z][a-z\s]+?)(?=\s+and\b|,|$)/i)?.[1] ||
    text.match(/\b(?:live in|based in|from|in)\s+([a-z][a-z\s]+?)(?=\s+and\b|,|$)/i)?.[1];
  const email = extractEmail(text);

  if (name) info.name = name.trim();
  if (role) info.role = role.trim();
  if (company) info.company = company.trim();
  if (location) info.location = location.trim();
  if (email) info.email = email.trim().toLowerCase();
  if (/\bgood morning\b.*\b(7\s*(am|a\.m\.)|m?morning 7)\b/i.test(text)) {
    info.morningWish = "Wish me good morning every day at 7:00 AM";
  }

  return info;
};

const parseTimeString = (value, baseDate = new Date(), { rollForward = true } = {}) => {
  const match = String(value || "").match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = (match[3] || "").toLowerCase();

  if (meridiem) {
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
  }

  if (hour >= 24 || minute >= 60) return null;

  const date = new Date(baseDate);
  date.setHours(hour, minute, 0, 0);
  if (rollForward && date <= new Date()) {
    date.setDate(date.getDate() + 1);
  }
  return date;
};

const parseRelativeDuration = (message) => {
  const match = String(message || "").match(/\b(?:in|after|for)\s+(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?)\b/i);
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const seconds = unit.startsWith("sec")
    ? value
    : unit.startsWith("min")
      ? value * 60
      : unit.startsWith("h") || unit.startsWith("hr")
        ? value * 60 * 60
        : value * 24 * 60 * 60;

  return {
    seconds,
    triggerAt: new Date(Date.now() + seconds * 1000),
    phrase: match[0],
  };
};

const parseDateParts = (dateText, timeText = "9:00 am") => {
  const parts = String(dateText || "").split(/[/-]/).map(Number);
  if (parts.length < 2 || parts.some((part) => Number.isNaN(part))) return null;

  const [first, second, rawYear] = parts;
  const currentYear = new Date().getFullYear();
  const year = rawYear ? (rawYear < 100 ? 2000 + rawYear : rawYear) : currentYear;
  const dayFirst = first > 12 || process.env.DEFAULT_DATE_ORDER !== "MDY";
  const day = dayFirst ? first : second;
  const month = dayFirst ? second : first;
  const base = new Date(year, month - 1, day, 0, 0, 0, 0);

  if (base.getFullYear() !== year || base.getMonth() !== month - 1 || base.getDate() !== day) {
    return null;
  }

  return parseTimeString(timeText, base, { rollForward: false });
};

const parseReminderRequest = (message) => {
  const text = stripWakeWord(message);
  const now = new Date();
  let remindAt = null;
  let title = text
    .replace(/\b(remind me to|remind me|set a reminder to|set a reminder|set reminder|reminder|set an alarm|set alarm|alarm|set a timer|set timer|timer)\b/i, "")
    .trim();

  const relative = parseRelativeDuration(text);
  if (relative) {
    remindAt = relative.triggerAt;
  }

  const tomorrowMatch = text.match(/\btomorrow(?:\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?/i);
  if (!remindAt && tomorrowMatch) {
    remindAt = parseTimeString(tomorrowMatch[1] || "9:00 am", new Date(now.getTime() + 24 * 60 * 60 * 1000), { rollForward: false });
  }

  const todayMatch = text.match(/\btoday(?:\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?/i);
  if (!remindAt && todayMatch) {
    remindAt = parseTimeString(todayMatch[1] || "9:00 am", now, { rollForward: false });
    if (remindAt && remindAt <= now) remindAt = null;
  }

  const atMatch = text.match(/\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
  if (!remindAt && atMatch) {
    remindAt = parseTimeString(atMatch[1], now);
  }

  const explicitDateMatch = text.match(/\bon\s+(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)(?:\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?/i);
  if (!remindAt && explicitDateMatch) {
    remindAt = parseDateParts(explicitDateMatch[1], explicitDateMatch[2] || "9:00 am");
    if (remindAt && remindAt <= now) remindAt = null;
  }

  if (!remindAt) {
    const fallbackTime = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) || text.match(/\b(\d{1,2}):(\d{2})\b/);
    if (fallbackTime) {
      remindAt = parseTimeString(fallbackTime[0], now);
    }
  }

  const timePhrasePattern = /\b((?:in|after|for)\s+\d+\s*(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|days?)|tomorrow(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?|today(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|on\s+\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?)/i;
  const afterTo = title.match(/\bto\s+(.+)$/i)?.[1];
  title = (afterTo || title).replace(timePhrasePattern, "").replace(/\b(to|for)\b$/i, "").trim();
  if (!title) title = "Reminder";

  return { title, remindAt, hasTime: Boolean(remindAt) };
};

const parseAlarmRequest = (message) => {
  const { title, remindAt, hasTime } = parseReminderRequest(message);
  return {
    label: title || "Alarm",
    triggerAt: remindAt,
    hasTime,
  };
};

const getNextSevenAm = () => {
  const next = new Date();
  next.setHours(7, 0, 0, 0);
  if (next <= new Date()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
};

const formatMemory = (user) => {
  const details = [
    `Name: ${user.name}`,
    `Email: ${user.email}`,
    user.phone ? `Phone: ${user.phone}` : "",
    user.timezone ? `Timezone: ${user.timezone}` : "",
    ...(user.memory || []).map((item) => `${item.key}: ${item.value}`),
  ].filter(Boolean);

  return details.length ? details.join("\n") : "I do not have personal details saved yet.";
};

const routeAction = async ({ user, intent, message }) => {
  await VoiceEvent.create({
    user: user._id,
    transcript: message,
    wakeWordDetected: /\bnanna\b/i.test(message),
    confidence: intent.confidence,
  });

  const matchingSkill = await findMatchingSkill({ userId: user._id, message });
  if (matchingSkill && ["general_chat", "skill_request"].includes(intent.name)) {
    const skillResult = await runSkill({ skill: matchingSkill, message });
    return {
      data: { skill: skillResult.skill, result: skillResult.data },
      response: skillResult.response,
    };
  }

  switch (intent.name) {
    case "wake_word":
      return { data: {}, response: "Yes, I am listening. What should I do?" };

    case "show_tasks": {
      const tasks = await Task.find({ user: user._id }).sort({ createdAt: -1 }).limit(10);
      return {
        data: { tasks },
        response:
          tasks.length === 0
            ? "You do not have any tasks yet."
            : `You have ${tasks.length} task${tasks.length === 1 ? "" : "s"}.`,
      };
    }

    case "create_task": {
      const title = intent.entities.title || message;
      const task = await Task.create({ user: user._id, title });
      await createNotification({
        user,
        title: "Task created",
        body: task.title,
        channel: "telegram",
        metadata: { task: task._id, alertType: "task_created_ai" },
      });
      return { data: { task }, response: `Done. I created the task: ${task.title}` };
    }

    case "set_reminder": {
      const { title, remindAt, hasTime } = parseReminderRequest(message);
      if (!hasTime || !remindAt) {
        return {
          data: { needs: "reminder_time" },
          response: "Tell me the exact reminder time, for example: remind me tomorrow at 7 am, or remind me in 20 minutes.",
        };
      }

      const scheduledAt = remindAt;
      const reminder = await Reminder.create({
        user: user._id,
        title,
        remindAt: scheduledAt,
        channel: "telegram",
      });
      const formatted = scheduledAt.toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: user.timezone || "Asia/Kolkata",
      });
      return {
        data: { reminder },
        response: `Done. I set a reminder for ${formatted}.`,
      };
    }

    case "save_personal_info": {
      const info = extractPersonalInfo(message);
      const saved = [];

      if (info.name) {
        user.name = info.name;
        saved.push("name");
      }
      if (info.email && info.email === user.email) {
        saved.push("email");
      }
      if (info.role && upsertMemory(user, "role", info.role)) saved.push("role");
      if (info.company && upsertMemory(user, "company", info.company)) saved.push("company");
      if (info.location && upsertMemory(user, "location", info.location)) saved.push("location");
      if (info.email && upsertMemory(user, "preferred_email", info.email)) saved.push("preferred email");
      if (info.morningWish && upsertMemory(user, "morning_wish", info.morningWish)) {
        saved.push("7 AM good morning wish");
        await Reminder.create({
          user: user._id,
          title: `Good morning, ${info.name || user.name}. Have a focused day.`,
          notes: "Daily morning wish requested through NANNA memory.",
          remindAt: getNextSevenAm(),
          channel: "in_app",
        });
      }

      await user.save();

      return {
        data: { saved, memory: user.memory },
        response:
          saved.length === 0
            ? "I heard you. Tell me the detail in a clear sentence like: my name is Shahil, I work at Cybersquare, and I live in Calicut."
            : `Saved: ${saved.join(", ")}. I will use these details when I help you.`,
      };
    }

    case "show_personal_info":
      return {
        data: { memory: user.memory },
        response: `Here is what I know about you:\n${formatMemory(user)}`,
      };

    case "make_call": {
      if (!intent.entities.phoneNumber) {
        return {
          data: { needs: "phone_number" },
          response: "Share the recipient phone number and I will prepare the call automation.",
        };
      }

      const job = await createAndRunJob({
        user,
        type: "call",
        payload: {
          to: intent.entities.phoneNumber,
          text: cleanMessageText(message, [/\b(call|phone|dial)\b/gi, intent.entities.phoneNumber]),
        },
      });

      return {
        data: { job, result: job.result },
        response:
          job.result.status === "not_configured"
            ? `I saved the call request for ${intent.entities.phoneNumber}. To place real calls, connect a voice provider such as Twilio in the backend.`
            : `Calling ${intent.entities.phoneNumber} now.`,
      };
    }

    case "email_access": {
      const job = await AutomationJob.create({
        user: user._id,
        type: "email",
        payload: { action: "connect_mailbox" },
        status: "queued",
        result: { status: "needs_oauth" },
      });

      return {
        data: { job },
        response:
          "I can help with email after a secure mailbox connection is added. Do not share your password here; use Gmail OAuth or an app-specific mail token in settings/backend config.",
      };
    }

    case "unsafe_credential":
      return {
        data: { blocked: true },
        response:
          "I will not store or use email passwords from chat. Please change that password if it was real, then connect email through OAuth or an app-specific token.",
      };

    case "send_sms": {
      if (!intent.entities.phoneNumber) {
        return {
          data: { needs: "phone_number" },
          response: "Share the phone number and message text, and I will prepare the SMS.",
        };
      }

      const job = await createAndRunJob({
        user,
        type: "sms",
        payload: {
          to: intent.entities.phoneNumber,
          text: cleanMessageText(message, [/\b(send|write|sms|text message|message|to)\b/gi, intent.entities.phoneNumber]),
        },
      });

      return {
        data: { job },
        response:
          job.result.status === "sent"
            ? `SMS sent to ${intent.entities.phoneNumber}.`
            : `SMS queued for ${intent.entities.phoneNumber}. ${job.result.message}`,
      };
    }

    case "send_telegram": {
      const to = user.telegramChatId || process.env.TELEGRAM_DEFAULT_CHAT_ID;

      if (!to) {
        return {
          data: { needs: "telegram_chat_id" },
          response: "Save your Telegram chat ID in your profile first, then I can send Telegram messages for free through your bot.",
        };
      }

      const job = await createAndRunJob({
        user,
        type: "telegram",
        payload: {
          to,
          text: cleanMessageText(message, [/\b(send|write|telegram|message|text|to|my chat)\b/gi, to]),
        },
      });

      return {
        data: { job },
        response:
          job.result.status === "sent"
            ? "Telegram message sent. You can reply to NANNA in the same chat."
            : `Telegram message was not sent yet. ${job.result.message}`,
      };
    }

    case "create_notification": {
      const { notification } = await createNotification({
        user,
        title: intent.entities.title || "NANNA alert",
        body: message,
        channel: "telegram",
        status: "unread",
      });

      return {
        data: { notification },
        response: "Done. I sent the Telegram notification.",
      };
    }

    case "set_alarm": {
      const { label, triggerAt, hasTime } = parseAlarmRequest(message);
      if (!hasTime || !triggerAt) {
        return {
          data: { needs: "alarm_time" },
          response: "Tell me the exact alarm time, for example: set alarm at 7 am, or set alarm tomorrow at 6:30 am.",
        };
      }

      const alarm = await AlarmTimer.create({
        user: user._id,
        type: "alarm",
        label: intent.entities.label || label || "Alarm",
        triggerAt,
      });
      await createNotification({
        user,
        title: "Alarm scheduled",
        body: `${alarm.label} at ${triggerAt.toLocaleString("en-IN", { timeZone: user.timezone || "Asia/Kolkata" })}`,
        channel: "telegram",
        metadata: { alarm: alarm._id, alertType: "alarm_scheduled_ai" },
      });
      const formatted = triggerAt.toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: user.timezone || "Asia/Kolkata",
      });
      return {
        data: { alarm },
        response: `Alarm scheduled for ${formatted}.`,
      };
    }

    case "show_alarms": {
      const alarms = await AlarmTimer.find({
        user: user._id,
        status: "scheduled",
        triggerAt: { $gte: new Date() },
      })
        .sort({ triggerAt: 1 })
        .limit(5);

      if (alarms.length === 0) {
        return { data: { alarms }, response: "You do not have any upcoming alarms or timers." };
      }

      const nextAlarm = alarms[0];
      const when = nextAlarm.triggerAt.toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      });

      return {
        data: { alarms },
        response: `Your next ${nextAlarm.type} is ${when}: ${nextAlarm.label}.`,
      };
    }

    case "set_timer": {
      const duration = parseRelativeDuration(message);
      if (!duration) {
        return {
          data: { needs: "timer_duration" },
          response: "Tell me the timer duration, for example: set timer for 5 minutes, or set timer for 30 seconds.",
        };
      }

      const timer = await AlarmTimer.create({
        user: user._id,
        type: "timer",
        label: intent.entities.label || "Timer",
        durationSeconds: duration.seconds,
        triggerAt: duration.triggerAt,
      });
      await createNotification({
        user,
        title: "Timer scheduled",
        body: `${timer.label} for ${duration.seconds} seconds.`,
        channel: "telegram",
        metadata: { alarm: timer._id, alertType: "timer_scheduled_ai" },
      });
      return { data: { timer }, response: `Timer set for ${duration.seconds} seconds.` };
    }

    case "control_device": {
      const result = await controlDevice({
        userId: user._id,
        deviceName: intent.entities.deviceName,
        command: intent.entities.command,
        value: intent.entities.value,
      });
      return { data: result, response: result.response };
    }

    case "run_routine": {
      const result = await runRoutineWithNotification({ userId: user._id, phrase: intent.entities.phrase });
      return { data: result, response: result.response };
    }

    case "media_control": {
      const query = intent.entities.query || message;
      const provider = /\bspotify\b/i.test(query) ? "spotify" : /\byoutube\b/i.test(query) ? "youtube" : "youtube";
      const job = await AutomationJob.create({
        user: user._id,
        type: "custom",
        status: "completed",
        payload: { module: "media", provider, ...intent.entities },
        result: { status: "ready" },
      });
      return {
        data: { job },
        response:
          intent.entities.command === "open_camera"
            ? "Opening the camera studio."
            : intent.entities.command === "take_photo"
              ? "Open the camera studio and tap Take Photo."
              : intent.entities.command === "record_video"
                ? "Open the camera studio and tap Record Video."
                : `Opening ${provider === "spotify" ? "Spotify" : "YouTube"} for your media request.`,
      };
    }

    case "information_query": {
      return {
        data: { topic: intent.entities.topic },
        response: null,
      };
    }

    case "send_email": {
      const to = intent.entities.email || extractEmail(message) || user.email;
      const job = await createAndRunJob({
        user,
        type: "email",
        payload: {
          to,
          subject: intent.entities.subject || "NANNA message",
          text: cleanMessageText(message, [/\b(send|write|draft|email|mail|to)\b/gi, to]),
        },
      });
      return {
        data: { job, result: job.result },
        response:
          job.result.status === "sent"
            ? `Email sent to ${to}.`
            : `Email queued for ${to}. ${job.result.message}`,
      };
    }

    default:
      return {
        data: {},
        response: null,
      };
  }
};

module.exports = { routeAction };
