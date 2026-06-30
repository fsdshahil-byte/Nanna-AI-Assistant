const ChatHistory = require("../models/ChatHistory");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { detectIntent } = require("./ai/intentDetector");
const { generateAssistantResponse } = require("./ai/responseGenerator");
const { emitDashboardChanged } = require("./realtimeService");
const {
  formatE164,
  logTelegramEvent,
  sanitizeTelegramText,
  sendEmail,
  sendSms,
  sendTelegram,
} = require("./communicationService");

const findUserByPhone = async (phone) => {
  const incoming = formatE164(phone);
  if (!incoming) return null;

  const users = await User.find({ phone: { $exists: true, $ne: "" } });
  return users.find((user) => formatE164(user.phone) === incoming) || null;
};

const findUserByEmail = async (email) => {
  const value = String(email || "").trim().toLowerCase();
  if (!value) return null;
  return User.findOne({ email: value });
};

const findUserByTelegramChatId = async (chatId) => {
  const value = String(chatId || "").trim();
  if (!value) return null;
  return User.findOne({
    $or: [{ telegramChatId: value }, { telegramChat: value }],
  });
};

const findUserByTelegramIdentity = async ({ chatId, telegramId, username }) => {
  const values = [];
  if (chatId) values.push({ telegramChatId: String(chatId) }, { telegramChat: String(chatId) });
  if (telegramId) values.push({ telegramId: String(telegramId) });
  if (username) values.push({ telegramUsername: String(username).replace(/^@/, "") });
  if (!values.length) return null;
  return User.findOne({ $or: values });
};

const updateUserTelegramIdentity = async ({ user, telegramUser = {}, chatId }) => {
  if (!user) return null;
  const update = {
    telegramChatId: String(chatId || user.telegramChatId || "").trim(),
    telegramChat: String(chatId || user.telegramChat || "").trim(),
    telegramId: telegramUser.id ? String(telegramUser.id) : user.telegramId,
    telegramUsername: telegramUser.username || user.telegramUsername || "",
    telegramFirstName: telegramUser.first_name || user.telegramFirstName || "",
    telegramLastName: telegramUser.last_name || user.telegramLastName || "",
  };

  return User.findByIdAndUpdate(user._id, update, { returnDocument: "after" });
};

const createInboundNotification = async ({ user, channel, title, body, metadata = {} }) => {
  const notification = await Notification.create({
    user: user._id,
    title,
    body,
    channel,
    status: "unread",
    metadata: {
      inbound: true,
      promptOpen: true,
      ring: true,
      ...metadata,
    },
  });
  
  // Include file information in the emit for real-time display
  emitDashboardChanged(user._id, {
    reason: "inbound_notification",
    channel,
    notificationId: notification._id.toString(),
    hasMedia: !!metadata.file || !!metadata.media,
    mediaType: metadata.mediaType || (metadata.media?.type),
    fileUrl: metadata.file?.file?.relativeUrl,
    fileId: metadata.file?.file?.fileId,
  });
  return notification;
};

const createAiReply = async ({ user, channel, message, source, threadId, metadata = {}, onBeforeAi }) => {
  const existingChat = await ChatHistory.findOne({ user: user._id });
  const recentMessages = (existingChat?.messages || []).slice(-12);
  const intent = detectIntent(message);
  if (onBeforeAi) await onBeforeAi({ intent, recentMessages });
  const { routeAction } = require("./ai/actionRouter");
  const actionResult = await routeAction({ user, intent, message });
  const assistantResult = await generateAssistantResponse({
    message,
    intent,
    actionResult,
    user,
    recentMessages,
  });
  const assistantMessage = assistantResult.content || "I received your message.";

  await ChatHistory.findOneAndUpdate(
    { user: user._id },
    {
      $push: {
        messages: {
          $each: [
            { role: "user", content: message, intent: intent.name, metadata: { channel, source, ...metadata } },
            {
              role: "assistant",
              content: assistantMessage,
              intent: intent.name,
              threadId,
              metadata: {
                channel,
                source,
                ...metadata,
                confidence: intent.confidence,
                action: actionResult.data,
                liveInfo: assistantResult.liveInfo,
              },
            },
          ],
        },
      },
    },
    { upsert: true, returnDocument: "after" }
  );

  emitDashboardChanged(user._id, {
    reason: "chat",
    channel,
    intent: intent.name,
  });

  return { assistantMessage, intent, actionResult };
};

const recordInboundOnly = async ({ user, channel, message, source, threadId, metadata = {} }) => {
  const intent = detectIntent(message);

  await ChatHistory.findOneAndUpdate(
    { user: user._id },
    {
      $push: {
        messages: {
          role: "user",
          content: message,
          intent: intent.name,
          metadata: {
            inboundOnly: true,
            channel,
            source,
            threadId,
            ...metadata,
          },
        },
      },
    },
    { upsert: true, returnDocument: "after" }
  );

  emitDashboardChanged(user._id, {
    reason: "inbound_message",
    channel,
    intent: intent.name,
  });

  return { intent };
};

const handleInboundMessage = async ({
  channel,
  user,
  from,
  subject,
  message,
  metadata = {},
  autoReply = true,
}) => {
  const text = sanitizeTelegramText(message);
  if (!user || !text) return { handled: false };

  let threadId = null;

if (channel === "email") {
  const match = subject?.match(/\[(.*?)\]/);

  if (match) {
    threadId = match[1]; // existing thread
  } else {
    threadId = `thread-${from}-${Date.now()}`; // new thread
  }
}

if (channel === "email") {
  const lowerSubject = subject?.toLowerCase() || "";
  const text = String(message || "").trim();

  // 🔥 PUT IT HERE
  const isReply =
    lowerSubject.startsWith("re:") ||
    lowerSubject.includes("re:") ||
    text.length < 200;

  if (isReply) {
    const autoReplyText = "Got your mail, I'll update Shahil.";

    await sendEmail({
      to: from,
      subject: `Re: ${subject} [${threadId}]`,
      text: autoReplyText,
    });

    await createInboundNotification({
      user,
      channel,
      title: `EMAIL reply from ${from}`,
      body: text,
      metadata: {
        from,
        subject,
        aiReply: autoReplyText,
        type: "auto-reply",
      },
    });

    return {
      handled: true,
      type: "auto-reply",
      reply: autoReplyText,
    };
  }
}

  if (channel === "telegram" && !autoReply) {
    // 🔥 TELEGRAM MESSAGES ARE KEPT SEPARATE - NOT IN NANNA ASSISTANT CHAT
    // Only create a notification, do NOT add to ChatHistory
    await createInboundNotification({
      user,
      channel,
      title: `Telegram message from ${metadata.telegramUser?.displayName || metadata.telegramUser?.username || from}`,
      body: text,
      metadata: {
        from,
        threadId,
        ...metadata,
        manualReplyRequired: true,
      },
    });

    return { handled: true, type: "manual-review" };
  }

  // 🔥 STEP 2: NORMAL AI FLOW
  const { assistantMessage, intent } = await createAiReply({
    user,
    channel,
    message: text,
    source: from,
    threadId,
    metadata,
    onBeforeAi: async () => {},
  });

  let delivery = null;

  if (autoReply && channel === "sms") {
    delivery = await sendSms({ to: from, text: assistantMessage });
  } else if (autoReply && channel === "telegram") {
    delivery = await sendTelegram({ to: from, text: assistantMessage });
    logTelegramEvent("ai.reply", { chatId: from, userId: user._id.toString(), intent: intent.name, status: delivery.status });
  } else if (autoReply && channel === "email") {
    delivery = await sendEmail({
      to: from,
      subject: subject ? `Re: ${subject} [${threadId}]` : `NANNA reply [${threadId}]`,
      text: assistantMessage,
    });
  }

  // 🔥 STEP 3: SAVE NOTIFICATION
  await createInboundNotification({
    user,
    channel,
    title: `${channel.toUpperCase()} reply from ${from}`,
    body: text,
    metadata: {
      from,
      subject,
      threadId,
      ...metadata,
      aiReply: assistantMessage,
      intent: intent.name,
      delivery,
    },
  });

  return { handled: true, assistantMessage, delivery };
};

const handleMissedCall = async ({ user, from }) => {
  if (!user) return { handled: false };
  await createInboundNotification({
    user,
    channel: "call",
    title: `Missed call from ${from}`,
    body: "You have a missed call.",
    metadata: { from, alertType: "missed_call" },
  });
  return { handled: true };
};

module.exports = {
  findUserByEmail,
  findUserByPhone,
  findUserByTelegramChatId,
  findUserByTelegramIdentity,
  updateUserTelegramIdentity,
  handleInboundMessage,
  handleMissedCall,
};
