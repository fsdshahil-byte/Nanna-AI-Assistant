const Notification = require("../models/Notification");
const User = require("../models/User");
const { logTelegramEvent, sendTelegram } = require("./communicationService");
const { emitDashboardChanged } = require("./realtimeService");

const getUserDocument = async (user) => {
  if (!user) return null;
  if (user.telegramChatId || user.telegramChat || user.email) return user;
  return User.findById(user);
};

const getTelegramChatId = (user) => user?.telegramChatId || user?.telegramChat || process.env.TELEGRAM_DEFAULT_CHAT_ID || "";

const createNotification = async ({
  user,
  title,
  body = "",
  channel = "in_app",
  status = "unread",
  metadata = {},
  deliverTelegram = false,
}) => {
  const userDoc = await getUserDocument(user);
  const userId = userDoc?._id || user;

  const notification = await Notification.create({
    user: userId,
    title,
    body,
    channel,
    status,
    metadata,
  });

  let telegram = null;
  const chatId = getTelegramChatId(userDoc);
  if (deliverTelegram && chatId) {
    const text = [title, body].filter(Boolean).join("\n");
    telegram = await sendTelegram({ to: chatId, text });
    logTelegramEvent("notification.sent", {
      userId: String(userId),
      chatId,
      title,
      status: telegram.status,
    });
    notification.metadata = { ...notification.metadata, telegram };
    if (telegram.status === "failed" || telegram.status === "not_configured") {
      notification.status = "failed";
    }
    await notification.save();
  }

  emitDashboardChanged(userId, {
    reason: "notification",
    notificationId: notification._id.toString(),
  });

  return { notification, telegram };
};

module.exports = { createNotification };
