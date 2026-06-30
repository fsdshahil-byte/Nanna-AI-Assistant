const express = require("express");
const router = express.Router();

const {
  checkTelegramHealth,
  downloadTelegramFile,
  getTelegramWebhookInfo,
  isTelegramConfigured,
  logTelegramEvent,
  sanitizeTelegramText,
  setTelegramWebhook,
} = require("../services/communicationService");
const {
  findUserByTelegramIdentity,
  handleInboundMessage,
  updateUserTelegramIdentity,
} = require("../services/inboundCommunicationService");
const User = require("../models/User");

const getMessage = (update) =>
  update.message ||
  update.edited_message ||
  update.channel_post ||
  update.edited_channel_post ||
  update.callback_query?.message ||
  null;

const getMedia = (message) => {
  if (message.photo?.length) return { type: "photo", fileId: message.photo.at(-1).file_id };
  if (message.voice) return { type: "voice", fileId: message.voice.file_id };
  if (message.audio) return { type: "audio", fileId: message.audio.file_id };
  if (message.video) return { type: "video", fileId: message.video.file_id };
  if (message.video_note) return { type: "video_note", fileId: message.video_note.file_id };
  if (message.animation) return { type: "animation", fileId: message.animation.file_id };
  if (message.document) return { type: "document", fileId: message.document.file_id };
  if (message.sticker) return { type: "sticker", fileId: message.sticker.file_id };
  return null;
};

const getTelegramUser = (update, message) =>
  update.callback_query?.from ||
  update.poll_answer?.user ||
  message?.from ||
  {};

const getChatId = (update, message) =>
  message?.chat?.id ||
  update.callback_query?.message?.chat?.id ||
  null;

const describeSender = (message) => {
  const from = message.from || {};
  return [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || "Telegram user";
};

const resolveFallbackUser = async ({ chatId }) => {
  const defaultEmail = String(process.env.TELEGRAM_DEFAULT_USER_EMAIL || "").trim().toLowerCase();
  if (defaultEmail) return User.findOne({ email: defaultEmail });

  const defaultChatId = String(process.env.TELEGRAM_DEFAULT_CHAT_ID || "").trim();
  if (defaultChatId && String(chatId) === defaultChatId) {
    const users = await User.find({}).limit(2);
    if (users.length === 1) return users[0];
  }

  return null;
};

const buildStructuredData = ({ update, message }) => {
  if (update.callback_query) {
    return {
      type: "callback_query",
      data: update.callback_query.data || "",
      queryId: update.callback_query.id,
      messageId: update.callback_query.message?.message_id,
    };
  }

  if (update.poll_answer) {
    return {
      type: "poll_answer",
      pollId: update.poll_answer.poll_id,
      optionIds: update.poll_answer.option_ids || [],
    };
  }

  if (!message) return null;

  if (message.location) return { type: "location", ...message.location };
  if (message.venue) return { type: "venue", ...message.venue };
  if (message.contact) return { type: "contact", ...message.contact };
  if (message.poll) return { type: "poll", ...message.poll };
  if (message.dice) return { type: "dice", ...message.dice };
  if (message.successful_payment) return { type: "payment", ...message.successful_payment };
  return null;
};

const buildStructuredText = (data) => {
  if (!data) return "";
  if (data.type === "callback_query") return `Pressed Telegram button: ${data.data || "(no data)"}`;
  if (data.type === "poll_answer") return `Answered Telegram poll ${data.pollId}: options ${(data.optionIds || []).join(", ") || "none"}`;
  if (data.type === "location") return `Shared location: ${data.latitude}, ${data.longitude}`;
  if (data.type === "venue") return `Shared venue: ${data.title || "Venue"} at ${data.address || `${data.location?.latitude}, ${data.location?.longitude}`}`;
  if (data.type === "contact") return `Shared contact: ${[data.first_name, data.last_name].filter(Boolean).join(" ") || "Contact"} ${data.phone_number || ""}`.trim();
  if (data.type === "poll") return `Shared poll: ${data.question || "Poll"}`;
  if (data.type === "dice") return `Sent ${data.emoji || "dice"} with value ${data.value}`;
  if (data.type === "payment") return `Completed Telegram payment: ${data.currency || ""} ${data.total_amount || ""}`.trim();
  return `Received Telegram ${data.type || "data"}`;
};

const buildMessageText = ({ message, text, media, file, structuredData }) => {
  const caption = sanitizeTelegramText(message.caption || "");
  if (text) return text;
  if (caption) return caption;
  const structuredText = buildStructuredText(structuredData);
  if (structuredText) return structuredText;
  if (media) {
    return `Received a ${media.type}${file?.file?.relativeUrl ? `: ${file.file.relativeUrl}` : ""}`;
  }
  return "";
};

const verifyTelegramSecret = (req) => {
  const expected = String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  if (!expected) return true;
  return req.get("X-Telegram-Bot-Api-Secret-Token") === expected;
};

router.get("/health", async (_req, res) => {
  const health = await checkTelegramHealth();
  const webhook = health.healthy ? await getTelegramWebhookInfo() : null;

  res.json({
    configured: isTelegramConfigured(),
    ...health,
    webhook: webhook?.webhook || null,
    webhookConfigured: Boolean(webhook?.webhook?.url),
  });
});

router.post("/setup-webhook", async (req, res) => {
  const result = await setTelegramWebhook(req.body?.url || process.env.TELEGRAM_WEBHOOK_URL);
  res.status(result.status === "sent" ? 200 : 400).json(result);
});

router.post("/webhook", async (req, res) => {
  try {
    if (!verifyTelegramSecret(req)) {
      logTelegramEvent("webhook.secret_rejected");
      return res.sendStatus(401);
    }

    const message = getMessage(req.body);
    const structuredData = buildStructuredData({ update: req.body, message });
    if (!message && !structuredData) return res.sendStatus(200);

    const chatId = getChatId(req.body, message);
    const text = sanitizeTelegramText(message?.text || req.body.callback_query?.data || "");
    const media = message ? getMedia(message) : null;
    const telegramUser = getTelegramUser(req.body, message);

    logTelegramEvent("incoming", {
      chatId,
      text: text || (media ? `[${media.type}]` : "text"),
      media: media?.type || structuredData?.type || "text",
      username: telegramUser.username,
    });

    let file = null;
    if (media) {
      file = await downloadTelegramFile({ fileId: media.fileId, kind: media.type });
    }

    const user =
      (await findUserByTelegramIdentity({
        chatId,
        telegramId: telegramUser.id,
        username: telegramUser.username,
      })) || (await resolveFallbackUser({ chatId }));

    if (!user) {
      logTelegramEvent("incoming.unlinked", { chatId, telegramId: telegramUser.id, username: telegramUser.username });
      return res.sendStatus(200);
    }

    const linkedUser = await updateUserTelegramIdentity({ user, telegramUser, chatId });
    
    // Build message text - use media description if no text
    let messageText = text;
    if (!messageText && media && file) {
      messageText = `Received ${media.type}: ${file.file?.relativeUrl || media.type}`;
    } else if (!messageText && structuredData) {
      messageText = buildStructuredText(structuredData);
    }

    if (!messageText && !media) {
      logTelegramEvent("incoming.empty", { chatId, telegramId: telegramUser.id, username: telegramUser.username });
      return res.sendStatus(200);
    }

   await handleInboundMessage({
  channel: "telegram",
  user,
  from: chatId,
  message: messageText || `[${media?.type || "media"}]`,
  metadata: {
    telegramUser,
    media,
    file,
    hasMedia: !!media,
    mediaType: media?.type,
    fileUrl: file?.file?.url || file?.file?.relativeUrl,
    fileId: file?.file?.fileId,
  },
  autoReply: false,
});

    return res.sendStatus(200);
  } catch (err) {
    console.error("Telegram webhook error:", err);
    return res.sendStatus(500);
  }
});

module.exports = router;
