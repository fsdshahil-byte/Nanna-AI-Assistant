const ChatHistory = require("../models/ChatHistory");
const asyncHandler = require("../utils/asyncHandler");
const { detectIntent } = require("../services/ai/intentDetector");
const { routeAction } = require("../services/ai/actionRouter");
const { generateAssistantResponse } = require("../services/ai/responseGenerator");
const { emitDashboardChanged } = require("../services/realtimeService");

const obsoleteProviderReplies = [
  "My AI brain is connected, but the OpenAI account has no available quota right now. Please check billing or add credits, then try again.",
];

const removeObsoleteProviderReplies = (messages = []) =>
  messages.filter((message) => !obsoleteProviderReplies.includes(message.content));

const applyRecentContext = ({ intent, message, recentMessages }) => {
  if (intent.name !== "general_chat") return intent;

  const text = message.toLowerCase().trim();
  const previousMessages = recentMessages.slice(-4);
  const recentText = previousMessages.map((item) => item.content.toLowerCase()).join(" ");

  if (
    /\bweather\b/.test(recentText) &&
    /^[a-z\s,.-]+(?:india|kerala|calicut|kozhikode|city|area)?$/i.test(text)
  ) {
    return {
      name: "information_query",
      confidence: 0.72,
      entities: { topic: `weather today in ${message}` },
    };
  }

  if (/\b(access|check|read|connect)\b.*\b(mail|email|gmail|inbox|account)\b/.test(recentText)) {
    return {
      name: "email_access",
      confidence: 0.72,
      entities: {},
    };
  }

  return intent;
};

const chatWithNanna = asyncHandler(async (req, res) => {
  const { message } = req.body;

  if (!message) {
    res.status(400);
    throw new Error("Message is required");
  }

  const existingChat = await ChatHistory.findOne({ user: req.user._id });
  const recentMessages = removeObsoleteProviderReplies(existingChat?.messages || []).slice(-12);
  const intent = applyRecentContext({
    intent: detectIntent(message),
    message,
    recentMessages,
  });
  const actionResult = await routeAction({ user: req.user, intent, message });

  const assistantResult = await generateAssistantResponse({
    message,
    intent,
    actionResult,
    user: req.user,
    recentMessages,
  });
  const assistantMessage = assistantResult.content;

  const chat = await ChatHistory.findOneAndUpdate(
    { user: req.user._id },
    {
      $push: {
        messages: {
          $each: [
            { role: "user", content: message, intent: intent.name },
            {
              role: "assistant",
              content: assistantMessage,
              intent: intent.name,
              metadata: {
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

  emitDashboardChanged(req.user._id, {
    reason: "chat",
    intent: intent.name,
    chatId: chat._id.toString(),
  });

  res.json({
    reply: assistantMessage,
    intent,
    action: actionResult.data,
    liveInfo: assistantResult.liveInfo,
    chatId: chat._id,
  });
});

const getChatHistory = asyncHandler(async (req, res) => {
  const chat = await ChatHistory.findOne({ user: req.user._id });
  res.json({ messages: removeObsoleteProviderReplies(chat?.messages || []) });
});

module.exports = { chatWithNanna, getChatHistory };
