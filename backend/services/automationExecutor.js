const AutomationJob = require("../models/AutomationJob");
const { 
  sendEmail, 
  sendSms, 
  sendTelegram, 
  triggerCall, 
  formatE164,
  normalizeTelegramChatId 
} = require("./communicationService");
const { createNotification } = require("./notificationService");
const { findUserByPhone } = require("./inboundCommunicationService");

const getRecipient = ({ user, payload = {}, channel }) => {
  const explicitRecipient = payload.to || payload.recipient;
  if (explicitRecipient) return explicitRecipient;
  if (channel === "telegram") return user.telegramChatId;
  return ["sms", "call"].includes(channel) ? user.phone : user.email;
};

const getMessage = (payload = {}) => payload.text || payload.message || payload.body || "NANNA notification";

const resolveTelegramRecipient = async (recipient) => {
  const value = String(recipient || "").trim();
  if (!value) return "";

  const phoneLike = value.startsWith("+") || /[\s().-]/.test(value);
  if (phoneLike) {
    const phone = formatE164(value);
    if (phone) {
      const user = await findUserByPhone(phone);
      if (user?.telegramChatId) return user.telegramChatId;
    }
    return null;
  }

  return value;
};

const executeAutomationJob = async ({ job, user }) => {
  const payload = job.payload || {};
  let result;

  if (job.type === "email") {
    result = await sendEmail({
      to: getRecipient({ user, payload, channel: job.type }),
      subject: payload.subject || "NANNA message",
      text: getMessage(payload),
      attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
    });
  } else if (job.type === "sms") {
    result = await sendSms({ to: getRecipient({ user, payload, channel: job.type }), text: getMessage(payload) });
  } else if (job.type === "telegram") {
    const recipient = getRecipient({ user, payload, channel: job.type });
    const resolvedRecipient = await resolveTelegramRecipient(recipient);
    const mediaUrls = Array.isArray(payload.mediaUrls)
      ? payload.mediaUrls
      : Array.isArray(payload.attachments)
        ? payload.attachments.filter((item) => item?.url).map((item) => item.url)
        : [];

    if (resolvedRecipient === null) {
      result = await sendSms({
        to: recipient,
        text: getMessage(payload),
        mediaUrls,
      });
      if (result.status === "sent") {
        result.message = `SMS sent to ${recipient} (fallback from Telegram).`;
      }
    } else {
      result = await sendTelegram({
        ...payload,
        to: resolvedRecipient,
        text: getMessage(payload),
        mediaUrls,
        attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
      });
    }
  } else if (job.type === "call") {
    result = await triggerCall({ to: getRecipient({ user, payload, channel: job.type }), text: getMessage(payload) });
  } else if (job.type === "reminder") {
    result = {
      provider: "nanna_in_app",
      status: "sent",
      message: "Reminder notification created.",
    };
  } else {
    result = {
      provider: "nanna",
      status: "completed",
      message: "Custom automation recorded.",
    };
  }

  job.result = result;
  job.status =
    result.status === "sent" || result.status === "completed"
      ? "completed"
      : result.status === "failed" || result.status === "not_configured"
        ? "failed"
        : "queued";
  job.error = result.status === "failed" || result.status === "not_configured" ? result.message : "";
  await job.save();

  const notificationChannel = result.provider === "twilio_sms" ? "sms" : job.type === "telegram" ? "telegram" : ["email", "sms", "call"].includes(job.type) ? job.type : "telegram";

  await createNotification({
    user,
    title: payload.title || `${job.type} automation`,
    body: result.message || getMessage(payload),
    channel: notificationChannel,
    status: result.status === "failed" ? "failed" : "sent",
    metadata: { job: job._id, result },
    deliverTelegram: false,
  });

  return job;
};

const createAndRunJob = async ({ user, type, payload, scheduledFor }) => {
  const job = await AutomationJob.create({
    user: user._id,
    type,
    payload,
    scheduledFor,
    status: scheduledFor ? "queued" : "processing",
  });

  return scheduledFor ? job : executeAutomationJob({ job, user });
};

module.exports = { createAndRunJob, executeAutomationJob };
