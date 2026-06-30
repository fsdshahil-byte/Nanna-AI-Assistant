const fs = require("fs/promises");
const path = require("path");
const { FormData, Blob } = global;
const cleanEnv = (value = "") => String(value || "").trim();

const missing = (provider, message, extra = {}) => ({
  provider,
  status: "not_configured",
  message,
  ...extra,
});

const failed = (provider, message, extra = {}) => ({
  provider,
  status: "failed",
  message,
  ...extra,
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readPositiveIntEnv = (key, fallback) => {
  const value = Number.parseInt(process.env[key], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const TELEGRAM_DEFAULT_TIMEOUT_MS = readPositiveIntEnv("TELEGRAM_REQUEST_TIMEOUT_MS", 30000);
const TELEGRAM_UPLOAD_TIMEOUT_MS = readPositiveIntEnv("TELEGRAM_UPLOAD_TIMEOUT_MS", 30000);
const TELEGRAM_FILE_DOWNLOAD_TIMEOUT_MS = readPositiveIntEnv("TELEGRAM_FILE_DOWNLOAD_TIMEOUT_MS", 30000);
const TELEGRAM_MAX_ATTEMPTS = Math.max(1, readPositiveIntEnv("TELEGRAM_MAX_ATTEMPTS", 2));

const isAbortError = (error) =>
  error?.name === "AbortError" ||
  error?.name === "TimeoutError" ||
  /aborted|abort/i.test(error?.message || "");

const isTransientNetworkError = (error) =>
  isAbortError(error) ||
  ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_SOCKET"].includes(error?.cause?.code || error?.code);

const describeFetchError = (error, timeoutMs) => {
  const code = error?.cause?.code || error?.code;
  if (isAbortError(error)) return `Telegram Bot API request timed out after ${timeoutMs}ms.`;
  if (code === "UND_ERR_CONNECT_TIMEOUT") {
    return `Could not connect to Telegram Bot API within ${timeoutMs}ms. Check internet/VPN/firewall/DNS, then try again.`;
  }
  return error.message || "Telegram Bot API network request failed.";
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const logTelegramEvent = (event, metadata = {}) => {
  const safeMetadata = { ...metadata };
  if (safeMetadata.token) delete safeMetadata.token;
  console.log(`[telegram] ${event}`, safeMetadata);
};

const sanitizeTelegramText = (value = "") =>
  String(value || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();

const splitTelegramText = (value = "", maxLength = 3900) => {
  const text = sanitizeTelegramText(value);
  if (!text) return [];

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let index = remaining.lastIndexOf("\n", maxLength);
    if (index < maxLength * 0.6) index = remaining.lastIndexOf(" ", maxLength);
    if (index < maxLength * 0.6) index = maxLength;
    chunks.push(remaining.slice(0, index).trim());
    remaining = remaining.slice(index).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
};

const formatE164 = (value, defaultCountryCode = process.env.DEFAULT_PHONE_COUNTRY_CODE || "+91") => {
  const raw = cleanEnv(value).replace(/^telegram:/i, "");
  if (!raw) return "";

  let cleaned = raw.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("00")) cleaned = cleaned.slice(2);

  if (cleaned.startsWith("+")) {
    const digits = cleaned.slice(1).replace(/\D/g, "");
    return digits ? `+${digits}` : "";
  }

  const digits = cleaned.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.length <= 10) {
    const country = cleanEnv(defaultCountryCode).replace(/[^\d+]/g, "");
    const prefix = country.startsWith("+") ? country : `+${country}`;
    return `${prefix}${digits}`;
  }

  return `+${digits}`;
};

const formEncode = (payload) => {
  const params = new URLSearchParams();
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item === undefined || item === null || item === "") return;
        params.append(key, String(item));
      });
      return;
    }
    params.append(key, String(value));
  });
  return params.toString();
};

const twilioRequest = async ({ path: requestPath, body }) => {
  const sid = cleanEnv(process.env.TWILIO_ACCOUNT_SID);
  const token = cleanEnv(process.env.TWILIO_AUTH_TOKEN);

  if (!sid || !token) {
    return missing("twilio", "Configure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in backend/.env.");
  }

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}${requestPath}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formEncode(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return failed("twilio", data.message || "Twilio request failed.", {
      code: data.code,
      details: data,
    });
  }

  return {
    provider: "twilio",
    status: "sent",
    message: "Twilio request accepted.",
    sid: data.sid,
    details: data,
  };
};

const inferMimeTypeFromUrl = (value = "") => {
  const lower = cleanEnv(value).toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".webm")) return "audio/webm";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
};

const inferTelegramMediaType = (mimeType = "", kind = "") => {
  if (kind === "voice") return { method: "sendVoice", field: "voice" };
  if (mimeType.startsWith("image/")) return { method: "sendPhoto", field: "photo" };
  if (mimeType.startsWith("audio/")) return { method: "sendAudio", field: "audio" };
  if (mimeType.startsWith("video/")) return { method: "sendVideo", field: "video" };
  return { method: "sendDocument", field: "document" };
};

const resolveLocalPath = (url) => {
  if (url.startsWith("/uploads/")) return path.join(__dirname, "..", url);
  if (url.startsWith("/")) return path.join(__dirname, "..", url.slice(1));
  if (path.isAbsolute(url)) return url;
  return path.join(__dirname, "..", url);
};

const resolveAttachmentBuffer = async (attachment) => {
  if (!attachment?.url) throw new Error("Attachment is missing URL.");

  const url = String(attachment.url);
  const name = attachment.name || path.basename(url.split("?")[0]) || "attachment";
  const contentType = attachment.type || inferMimeTypeFromUrl(url);

  if (url.startsWith("data:")) {
    const [, base64] = url.split(",");
    return {
      buffer: Buffer.from(base64 || "", "base64"),
      filename: name,
      contentType: url.match(/^data:([^;]+);/)?.[1] || contentType,
    };
  }

  if (/^https?:\/\//i.test(url)) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unable to fetch attachment: ${url}`);
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      filename: name,
      contentType: attachment.type || response.headers.get("content-type") || contentType,
    };
  }

  return {
    buffer: await fs.readFile(resolveLocalPath(url)),
    filename: name,
    contentType,
  };
};

const resolveAttachmentBase64 = async (attachment) => {
  const { buffer, filename, contentType } = await resolveAttachmentBuffer(attachment);
  return {
    filename,
    content_type: contentType,
    content: buffer.toString("base64"),
  };
};

const getTelegramBotToken = () => cleanEnv(process.env.TELEGRAM_BOT_TOKEN);
const getPublicBaseUrl = () => cleanEnv(process.env.PUBLIC_URL || process.env.APP_URL || process.env.TELEGRAM_PUBLIC_URL);
const isTelegramConfigured = () => Boolean(getTelegramBotToken());
const normalizeTelegramChatId = (value) => {
  const chatId = cleanEnv(value);
  if (!chatId) return "";
  if (/^\+\d[\d\s-]*$/.test(chatId)) return "";
  return chatId;
};

const checkTelegramHealth = async () => {
  if (!isTelegramConfigured()) {
    return {
      healthy: false,
      message: "Configure TELEGRAM_BOT_TOKEN in backend/.env.",
    };
  }

  let response;
  try {
    response = await fetchWithTimeout(`https://api.telegram.org/bot${getTelegramBotToken()}/getMe`);
  } catch (error) {
    return {
      healthy: false,
      message: error.name === "AbortError" ? "Telegram Bot API health check timed out." : error.message,
    };
  }
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.ok) {
    return {
      healthy: false,
      message: data.description || "Telegram Bot API authentication failed.",
      details: data,
    };
  }

  return {
    healthy: true,
    message: `Telegram bot connected as @${data.result?.username || data.result?.first_name || "bot"}.`,
    bot: data.result,
  };
};

const telegramApiGet = async (method) => {
  if (!isTelegramConfigured()) {
    return missing("telegram_bot", "Configure TELEGRAM_BOT_TOKEN in backend/.env.", {
      requiredEnv: ["TELEGRAM_BOT_TOKEN"],
    });
  }

  let response;
  try {
    response = await fetchWithTimeout(`https://api.telegram.org/bot${getTelegramBotToken()}/${method}`);
  } catch (error) {
    return failed("telegram_bot", error.name === "AbortError" ? "Telegram Bot API request timed out." : error.message);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    return failed("telegram_bot", data.description || "Telegram Bot API request failed.", {
      details: data,
    });
  }

  return {
    provider: "telegram_bot",
    status: "ok",
    message: "Telegram request completed.",
    details: data,
  };
};

const telegramApiGetJson = async (method, query = {}) => {
  if (!isTelegramConfigured()) {
    return missing("telegram_bot", "Configure TELEGRAM_BOT_TOKEN in backend/.env.", {
      requiredEnv: ["TELEGRAM_BOT_TOKEN"],
    });
  }

  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.append(key, String(value));
  });
  const suffix = params.toString() ? `?${params.toString()}` : "";
  let response;
  try {
    response = await fetchWithTimeout(`https://api.telegram.org/bot${getTelegramBotToken()}/${method}${suffix}`);
  } catch (error) {
    logTelegramEvent("request.network_error", { method, message: error.message });
    return failed("telegram_bot", error.name === "AbortError" ? "Telegram Bot API request timed out." : error.message);
  }
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.ok) {
    logTelegramEvent("request.failed", { method, status: response.status, description: data.description });
    return failed("telegram_bot", data.description || "Telegram Bot API request failed.", { details: data });
  }

  return { provider: "telegram_bot", status: "ok", message: "Telegram request completed.", details: data };
};

const telegramApiRequest = async ({ method, body, formData, attempt = 1, timeoutMs }) => {
  if (!isTelegramConfigured()) {
    return missing("telegram_bot", "Configure TELEGRAM_BOT_TOKEN in backend/.env.", {
      requiredEnv: ["TELEGRAM_BOT_TOKEN"],
    });
  }

  const headers = {};
  if (!formData) headers["Content-Type"] = "application/json";

  let response;
  const requestTimeoutMs = timeoutMs || (formData ? TELEGRAM_UPLOAD_TIMEOUT_MS : TELEGRAM_DEFAULT_TIMEOUT_MS);
  try {
    response = await fetchWithTimeout(`https://api.telegram.org/bot${getTelegramBotToken()}/${method}`, {
      method: "POST",
      headers,
      body: formData || JSON.stringify(body),
    }, requestTimeoutMs);
  } catch (error) {
    const message = describeFetchError(error, requestTimeoutMs);
    logTelegramEvent("request.network_error", {
      method,
      message,
      attempt,
      timeoutMs: requestTimeoutMs,
      code: error?.cause?.code || error?.code,
      chatId: body?.chat_id || "form-data",
    });
    if (isTransientNetworkError(error) && attempt < TELEGRAM_MAX_ATTEMPTS) {
      await sleep(500 * attempt);
      return telegramApiRequest({ method, body, formData, attempt: attempt + 1, timeoutMs });
    }
    return failed("telegram_bot", message);
  }

  const data = await response.json().catch(() => ({}));
  if (response.status === 429 && attempt < 3) {
    const retryAfter = Number(data.parameters?.retry_after || 1);
    logTelegramEvent("request.rate_limited", { method, retryAfter, attempt });
    await sleep(Math.min(Math.max(retryAfter, 1), 10) * 1000);
    return telegramApiRequest({ method, body, formData, attempt: attempt + 1, timeoutMs });
  }

  if (!response.ok || !data.ok) {
    logTelegramEvent("request.failed", { method, status: response.status, description: data.description });
    return failed("telegram_bot", data.description || "Telegram Bot API request failed.", {
      details: data,
    });
  }

  logTelegramEvent("request.sent", { method, chatId: body?.chat_id || "form-data" });
  return {
    provider: "telegram_bot",
    status: "sent",
    message: "Telegram message sent.",
    details: data,
  };
};

const sendTelegramTyping = async (chatId, action = "typing") => {
  const normalizedChatId = normalizeTelegramChatId(chatId);
  if (!normalizedChatId) return failed("telegram_bot", "Telegram chat ID is required for chat action.");
  return telegramApiRequest({ method: "sendChatAction", body: { chat_id: normalizedChatId, action } });
};

const sendTelegramMessage = async ({ chatId, text, parseMode, replyMarkup }) => {
  const chunks = splitTelegramText(text);
  const results = [];
  for (const chunk of chunks) {
    results.push(await telegramApiRequest({
      method: "sendMessage",
      body: {
        chat_id: chatId,
        text: chunk,
        ...(parseMode ? { parse_mode: parseMode } : {}),
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      },
    }));
  }
  return results;
};

const downloadTelegramFile = async ({ fileId, kind = "file", publicBaseUrl = getPublicBaseUrl() }) => {
  const info = await telegramApiGetJson("getFile", { file_id: fileId });
  if (info.status !== "ok") return info;

  const filePath = info.details.result?.file_path;
  if (!filePath) return failed("telegram_bot", "Telegram did not return a downloadable file path.", { details: info.details });

  let response;
  try {
    response = await fetchWithTimeout(
      `https://api.telegram.org/file/bot${getTelegramBotToken()}/${filePath}`,
      {},
      TELEGRAM_FILE_DOWNLOAD_TIMEOUT_MS
    );
  } catch (error) {
    return failed("telegram_bot", describeFetchError(error, TELEGRAM_FILE_DOWNLOAD_TIMEOUT_MS));
  }
  if (!response.ok) {
    return failed("telegram_bot", "Telegram file download failed.", { statusCode: response.status });
  }

  const extension = path.extname(filePath) || "";
  const safeKind = String(kind || "file").replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "file";
  const filename = `${Date.now()}-${safeKind}-${path.basename(filePath).replace(/[^a-z0-9._-]/gi, "_") || `telegram${extension}`}`;
  const uploadsDir = path.join(__dirname, "..", "uploads", "telegram");
  await fs.mkdir(uploadsDir, { recursive: true });
  const storedPath = path.join(uploadsDir, filename);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(storedPath, buffer);

  const relativeUrl = `/uploads/telegram/${filename}`;
  return {
    provider: "telegram_bot",
    status: "downloaded",
    message: "Telegram file downloaded.",
    file: {
      fileId,
      telegramPath: filePath,
      storedPath,
      url: publicBaseUrl ? `${publicBaseUrl}${relativeUrl}` : relativeUrl,
      relativeUrl,
      size: buffer.length,
      kind,
    },
  };
};

const getTelegramWebhookInfo = async () => {
  const result = await telegramApiGet("getWebhookInfo");
  if (result.status !== "ok") return result;

  return {
    ...result,
    webhook: result.details.result || {},
    message: result.details.result?.url ? "Telegram webhook is set." : "Telegram webhook is not set.",
  };
};

const setTelegramWebhook = async (url = process.env.TELEGRAM_WEBHOOK_URL) => {
  const webhookUrl = cleanEnv(url);
  if (!webhookUrl) {
    return failed("telegram_bot", "Configure TELEGRAM_WEBHOOK_URL in backend/.env before setting the Telegram webhook.", {
      requiredEnv: ["TELEGRAM_WEBHOOK_URL"],
    });
  }

  const body = {
    url: webhookUrl,
    allowed_updates: [
      "message",
      "edited_message",
      "channel_post",
      "edited_channel_post",
      "callback_query",
      "poll",
      "poll_answer",
    ],
  };
  const secret = cleanEnv(process.env.TELEGRAM_WEBHOOK_SECRET);
  if (secret) body.secret_token = secret;

  return telegramApiRequest({ method: "setWebhook", body });
};

const sendTelegramAttachment = async ({ chatId, attachment }) => {
  let url = String(attachment.url || "");
  const type = attachment.type || inferMimeTypeFromUrl(url);
  const { method, field } = inferTelegramMediaType(type, attachment.kind);
  const caption = sanitizeTelegramText(attachment.caption || "");

  console.log(`[Telegram] Sending attachment: url="${url}", type="${type}", method="${method}"`);

  // Convert localhost URLs to local file paths
  // e.g., http://localhost:5000/uploads/file.mp3 -> /uploads/file.mp3
  if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?\//i.test(url)) {
    try {
      const urlObj = new URL(url);
      const localPath = urlObj.pathname;
      if (localPath.startsWith('/uploads/')) {
        url = localPath;
        console.log(`[Telegram] Converted localhost URL to local path: ${url}`);
      }
    } catch (e) {
      console.log(`[Telegram] Failed to parse localhost URL: ${url}`);
    }
  }

  // Check if URL is a local path (starts with /uploads/ or /)
  if (url.startsWith('/uploads/') || (url.startsWith('/') && !url.startsWith('//'))) {
    // Convert relative URL to absolute local file path
    const localPath = resolveLocalPath(url);
    console.log(`[Telegram] Local path resolved to: ${localPath}`);
    try {
      const { buffer, filename, contentType } = await resolveAttachmentBuffer({ url: localPath, type });
      const formData = new FormData();
      formData.append("chat_id", chatId);
      if (caption) formData.append("caption", caption);
      formData.append(field, new Blob([buffer], { type: contentType }), filename);
      console.log(`[Telegram] Uploading local file: ${filename}`);
      return telegramApiRequest({ method, formData });
    } catch (error) {
      console.error(`[Telegram] Failed to send local file: ${localPath}`, error.message);
      return failed("telegram_bot", `Failed to send attachment: ${error.message}`);
    }
  }

  // Check if URL is an absolute HTTP URL (non-localhost)
  if (/^https?:\/\//i.test(url)) {
    // For absolute HTTP URLs, send directly
    console.log(`[Telegram] Sending via HTTP URL: ${url}`);
    return telegramApiRequest({
      method,
      body: {
        chat_id: chatId,
        [field]: url,
        ...(caption ? { caption } : {}),
      },
    });
  }

  // For other cases (base64, file ID, etc.), use the buffer resolution
  try {
    console.log(`[Telegram] Sending via buffer resolution`);
    const { buffer, filename, contentType } = await resolveAttachmentBuffer(attachment);
    const formData = new FormData();
    formData.append("chat_id", chatId);
    if (caption) formData.append("caption", caption);
    formData.append(field, new Blob([buffer], { type: contentType }), filename);
    return telegramApiRequest({ method, formData });
  } catch (error) {
    console.error(`[Telegram] Failed to send attachment: ${url}`, error.message);
    return failed("telegram_bot", `Failed to send attachment: ${error.message}`);
  }
};

const sendTelegramLocation = async ({ chatId, latitude, longitude, horizontalAccuracy, livePeriod, heading, proximityAlertRadius, replyToMessageId }) => {
  const normalizedChatId = normalizeTelegramChatId(chatId);
  if (!normalizedChatId) return failed("telegram_bot", "Telegram chat ID is required.");
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return failed("telegram_bot", "Valid latitude and longitude are required.");
  }

  const body = {
    chat_id: normalizedChatId,
    latitude,
    longitude,
    ...(typeof horizontalAccuracy === "number" ? { horizontal_accuracy: horizontalAccuracy } : {}),
    ...(typeof livePeriod === "number" ? { live_period: livePeriod } : {}),
    ...(typeof heading === "number" ? { heading } : {}),
    ...(typeof proximityAlertRadius === "number" ? { proximity_alert_radius: proximityAlertRadius } : {}),
    ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
  };

  return telegramApiRequest({ method: "sendLocation", body });
};

const sendTelegramContact = async ({ chatId, phoneNumber, firstName, lastName, vcard, replyToMessageId }) => {
  const normalizedChatId = normalizeTelegramChatId(chatId);
  if (!normalizedChatId) return failed("telegram_bot", "Telegram chat ID is required.");
  if (!phoneNumber) return failed("telegram_bot", "Phone number is required.");

  const body = {
    chat_id: normalizedChatId,
    phone_number: phoneNumber,
    first_name: firstName,
    ...(lastName ? { last_name: lastName } : {}),
    ...(vcard ? { vcard } : {}),
    ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
  };

  return telegramApiRequest({ method: "sendContact", body });
};

const forwardTelegramMessage = async ({ chatId, fromChatId, messageId, disableNotification }) => {
  const normalizedChatId = normalizeTelegramChatId(chatId);
  if (!normalizedChatId) return failed("telegram_bot", "Telegram chat ID is required.");
  if (!fromChatId) return failed("telegram_bot", "Source chat ID is required.");
  if (!messageId) return failed("telegram_bot", "Message ID is required.");

  const body = {
    chat_id: normalizedChatId,
    from_chat_id: fromChatId,
    message_id: messageId,
    ...(disableNotification ? { disable_notification: disableNotification } : {}),
  };

  return telegramApiRequest({ method: "forwardMessage", body });
};

const sendTelegramPoll = async ({ chatId, question, options, isAnonymous, type, allowsMultipleAnswers, correctOptionId, explanation, explanationParseMode, openPeriod, closeDate, isClosed, replyToMessageId }) => {
  const normalizedChatId = normalizeTelegramChatId(chatId);
  if (!normalizedChatId) return failed("telegram_bot", "Telegram chat ID is required.");
  if (!question) return failed("telegram_bot", "Poll question is required.");
  if (!Array.isArray(options) || options.length === 0) return failed("telegram_bot", "Poll options are required.");

  const body = {
    chat_id: normalizedChatId,
    question,
    options: JSON.stringify(options),
    ...(typeof isAnonymous === "boolean" ? { is_anonymous: isAnonymous } : {}),
    ...(type ? { type } : {}),
    ...(typeof allowsMultipleAnswers === "boolean" ? { allows_multiple_answers: allowsMultipleAnswers } : {}),
    ...(typeof correctOptionId === "number" ? { correct_option_id: correctOptionId } : {}),
    ...(explanation ? { explanation } : {}),
    ...(explanationParseMode ? { explanation_parse_mode: explanationParseMode } : {}),
    ...(typeof openPeriod === "number" ? { open_period: openPeriod } : {}),
    ...(closeDate ? { close_date: closeDate } : {}),
    ...(typeof isClosed === "boolean" ? { is_closed: isClosed } : {}),
    ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
  };

  return telegramApiRequest({ method: "sendPoll", body });
};

const sendTelegramVenue = async ({ chatId, latitude, longitude, title, address, foursquareId, foursquareType, googlePlaceId, googlePlaceType, replyToMessageId }) => {
  const normalizedChatId = normalizeTelegramChatId(chatId);
  if (!normalizedChatId) return failed("telegram_bot", "Telegram chat ID is required.");
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return failed("telegram_bot", "Valid latitude and longitude are required.");
  }
  if (!title || !address) return failed("telegram_bot", "Venue title and address are required.");

  const body = {
    chat_id: normalizedChatId,
    latitude,
    longitude,
    title,
    address,
    ...(foursquareId ? { foursquare_id: foursquareId } : {}),
    ...(foursquareType ? { foursquare_type: foursquareType } : {}),
    ...(googlePlaceId ? { google_place_id: googlePlaceId } : {}),
    ...(googlePlaceType ? { google_place_type: googlePlaceType } : {}),
    ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
  };

  return telegramApiRequest({ method: "sendVenue", body });
};

const sendEmail = async ({ to, subject = "NANNA message", text = "", attachments = [] }) => {
  const key = cleanEnv(process.env.RESEND_API_KEY);
  const from = cleanEnv(process.env.EMAIL_FROM);

  if (!to) return failed("resend", "Enter an email address before sending.");
  if (!key || !from) {
    return missing("resend", "Configure RESEND_API_KEY and EMAIL_FROM in backend/.env.", {
      requiredEnv: ["RESEND_API_KEY", "EMAIL_FROM"],
    });
  }

  const payload = { from, to, subject, text };
  if (Array.isArray(attachments) && attachments.length > 0) {
    payload.attachments = await Promise.all(attachments.map(resolveAttachmentBase64));
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  return response.ok
    ? { provider: "resend", status: "sent", message: "Email sent.", id: data.id, to, subject, details: data }
    : failed("resend", data.message || "Email failed.", { details: data });
};

const sendSms = async ({ to, text = "", mediaUrls = [] }) => {
  const from = cleanEnv(process.env.TWILIO_SMS_FROM);
  const formattedTo = formatE164(to);

  if (!formattedTo) return failed("twilio_sms", "Enter a valid phone number before sending SMS.", { to });
  if (!from) {
    return missing("twilio_sms", "Configure TWILIO_SMS_FROM in backend/.env.", {
      requiredEnv: ["TWILIO_SMS_FROM", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
    });
  }

  const body = { From: from, To: formattedTo, Body: text || "NANNA message" };
  if (Array.isArray(mediaUrls) && mediaUrls.filter(Boolean).length > 0) {
    body.MediaUrl = mediaUrls.filter(Boolean);
  }

  const result = await twilioRequest({
    path: "/Messages.json",
    body,
  });

  return { ...result, provider: result.provider === "twilio" ? "twilio_sms" : result.provider, to: formattedTo };
};

const sendTelegram = async ({
  to,
  text = "",
  mediaUrls = [],
  attachments = [],
  parseMode,
  replyMarkup,
  shareType,
  location,
  latitude,
  longitude,
  horizontalAccuracy,
  livePeriod,
  heading,
  proximityAlertRadius,
  contact,
  phoneNumber,
  firstName,
  lastName,
  vcard,
  venue,
  title,
  address,
  foursquareId,
  foursquareType,
  googlePlaceId,
  googlePlaceType,
  poll,
  question,
  options,
  isAnonymous,
  pollType,
  type,
  allowsMultipleAnswers,
  correctOptionId,
  explanation,
  explanationParseMode,
  openPeriod,
  closeDate,
  isClosed,
  forward,
  fromChatId,
  messageId,
  disableNotification,
  replyToMessageId,
}) => {
  const chatId = normalizeTelegramChatId(to) || normalizeTelegramChatId(process.env.TELEGRAM_DEFAULT_CHAT_ID);
  if (!chatId) {
    return failed("telegram_bot", "Enter a Telegram chat ID, not a phone number. Open your bot in Telegram once, then save that chat ID in your profile.", { to });
  }

  if (!isTelegramConfigured()) {
    return missing("telegram_bot", "Configure TELEGRAM_BOT_TOKEN in backend/.env.", {
      requiredEnv: ["TELEGRAM_BOT_TOKEN"],
    });
  }

  const cleanText = sanitizeTelegramText(text);
  
  // Deduplicate media items - prefer attachments over mediaUrls to avoid sending files twice
  const seenUrls = new Set();
  const mediaItems = [];
  
  // Add attachments first (they have more metadata)
  if (Array.isArray(attachments) && attachments.length > 0) {
    for (const item of attachments) {
      if (item?.url && !seenUrls.has(item.url)) {
        seenUrls.add(item.url);
        mediaItems.push({ url: item.url, type: item.type, name: item.name, size: item.size, kind: item.kind });
      }
    }
  }
  
  // Add mediaUrls that aren't already in attachments
  if (Array.isArray(mediaUrls) && mediaUrls.length > 0) {
    for (const url of mediaUrls) {
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url);
        mediaItems.push({ url });
      }
    }
  }
  
  const results = [];
  const messageIds = [];

  const pushResult = (res) => {
    results.push(res);
    if (res.details?.result?.message_id) messageIds.push(res.details.result.message_id);
  };

  if (cleanText) {
    const textResults = await sendTelegramMessage({ chatId, text: cleanText, parseMode, replyMarkup });
    textResults.forEach(pushResult);
  }

  const locationPayload = location || (
    latitude !== undefined && longitude !== undefined
      ? { latitude, longitude, horizontalAccuracy, livePeriod, heading, proximityAlertRadius }
      : null
  );
  if ((shareType === "location" || locationPayload) && locationPayload) {
    pushResult(await sendTelegramLocation({
      chatId,
      latitude: Number(locationPayload.latitude),
      longitude: Number(locationPayload.longitude),
      horizontalAccuracy: locationPayload.horizontalAccuracy,
      livePeriod: locationPayload.livePeriod,
      heading: locationPayload.heading,
      proximityAlertRadius: locationPayload.proximityAlertRadius,
      replyToMessageId,
    }));
  }

  const contactPayload = contact || (
    phoneNumber
      ? { phoneNumber, firstName, lastName, vcard }
      : null
  );
  if ((shareType === "contact" || contactPayload) && contactPayload) {
    pushResult(await sendTelegramContact({
      chatId,
      phoneNumber: contactPayload.phoneNumber || contactPayload.phone_number,
      firstName: contactPayload.firstName || contactPayload.first_name || "Contact",
      lastName: contactPayload.lastName || contactPayload.last_name,
      vcard: contactPayload.vcard,
      replyToMessageId,
    }));
  }

  const venuePayload = venue || (
    title && address && latitude !== undefined && longitude !== undefined
      ? { latitude, longitude, title, address, foursquareId, foursquareType, googlePlaceId, googlePlaceType }
      : null
  );
  if ((shareType === "venue" || venuePayload) && venuePayload) {
    const venueLocation = venuePayload.location || venuePayload;
    pushResult(await sendTelegramVenue({
      chatId,
      latitude: Number(venueLocation.latitude),
      longitude: Number(venueLocation.longitude),
      title: venuePayload.title,
      address: venuePayload.address,
      foursquareId: venuePayload.foursquareId || venuePayload.foursquare_id,
      foursquareType: venuePayload.foursquareType || venuePayload.foursquare_type,
      googlePlaceId: venuePayload.googlePlaceId || venuePayload.google_place_id,
      googlePlaceType: venuePayload.googlePlaceType || venuePayload.google_place_type,
      replyToMessageId,
    }));
  }

  const pollPayload = poll || (
    question && Array.isArray(options)
      ? { question, options, isAnonymous, type: pollType || type, allowsMultipleAnswers, correctOptionId, explanation, explanationParseMode, openPeriod, closeDate, isClosed }
      : null
  );
  if ((shareType === "poll" || pollPayload) && pollPayload) {
    pushResult(await sendTelegramPoll({
      chatId,
      question: pollPayload.question,
      options: pollPayload.options,
      isAnonymous: pollPayload.isAnonymous ?? pollPayload.is_anonymous,
      type: pollPayload.type || pollPayload.pollType,
      allowsMultipleAnswers: pollPayload.allowsMultipleAnswers ?? pollPayload.allows_multiple_answers,
      correctOptionId: pollPayload.correctOptionId ?? pollPayload.correct_option_id,
      explanation: pollPayload.explanation,
      explanationParseMode: pollPayload.explanationParseMode || pollPayload.explanation_parse_mode,
      openPeriod: pollPayload.openPeriod ?? pollPayload.open_period,
      closeDate: pollPayload.closeDate ?? pollPayload.close_date,
      isClosed: pollPayload.isClosed ?? pollPayload.is_closed,
      replyToMessageId,
    }));
  }

  const forwardPayload = forward || (
    fromChatId && messageId
      ? { fromChatId, messageId, disableNotification }
      : null
  );
  if ((shareType === "forward" || forwardPayload) && forwardPayload) {
    pushResult(await forwardTelegramMessage({
      chatId,
      fromChatId: forwardPayload.fromChatId || forwardPayload.from_chat_id,
      messageId: forwardPayload.messageId || forwardPayload.message_id,
      disableNotification: forwardPayload.disableNotification ?? forwardPayload.disable_notification,
    }));
  }

  for (const item of mediaItems) {
    const res = await sendTelegramAttachment({ chatId, attachment: item });
    pushResult(res);
  }

  if (results.length === 0) {
    return failed("telegram_bot", "Type a message or attach media before sending Telegram.", { to: chatId });
  }

  const last = results[results.length - 1];
  return {
    provider: "telegram_bot",
    status: last.status,
    message: last.message || "Telegram sent.",
    to: chatId,
    text: cleanText,
    mediaUrls: mediaItems.map((item) => item.url),
    shareType,
    messageIds,
    details: last.details,
  };
};

const triggerCall = async ({ to, text = "" }) => {
  const from = cleanEnv(process.env.TWILIO_CALL_FROM);
  const webhookUrl = cleanEnv(process.env.TWILIO_CALL_WEBHOOK_URL);
  const formattedTo = formatE164(to);

  if (!formattedTo) return failed("twilio_voice", "Enter a valid phone number before starting a call.", { to });
  if (!from) {
    return missing("twilio_voice", "Configure TWILIO_CALL_FROM in backend/.env.", {
      requiredEnv: ["TWILIO_CALL_FROM", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
    });
  }

  const voiceMessage = String(text || "This is a NANNA AI call notification.").replace(/[<>&'"]/g, "");
  const body = {
    From: from,
    To: formattedTo,
    ...(webhookUrl ? { Url: webhookUrl } : { Twiml: `<Response><Say>${voiceMessage}</Say></Response>` }),
  };

  const result = await twilioRequest({ path: "/Calls.json", body });
  return { ...result, provider: result.provider === "twilio" ? "twilio_voice" : result.provider, to: formattedTo };
};

const getIntegrationStatus = () => ({
  email: {
    provider: "resend",
    configured: Boolean(cleanEnv(process.env.RESEND_API_KEY) && cleanEnv(process.env.EMAIL_FROM)),
    requiredEnv: ["RESEND_API_KEY", "EMAIL_FROM"],
  },
  sms: {
    provider: "twilio_sms",
    configured: Boolean(
      cleanEnv(process.env.TWILIO_ACCOUNT_SID) &&
        cleanEnv(process.env.TWILIO_AUTH_TOKEN) &&
        cleanEnv(process.env.TWILIO_SMS_FROM)
    ),
    requiredEnv: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_SMS_FROM"],
  },
  telegram: {
    provider: "telegram_bot",
    configured: isTelegramConfigured(),
    defaultChatSet: Boolean(cleanEnv(process.env.TELEGRAM_DEFAULT_CHAT_ID)),
    webhookSecretSet: Boolean(cleanEnv(process.env.TELEGRAM_WEBHOOK_SECRET)),
    webhookUrlSet: Boolean(cleanEnv(process.env.TELEGRAM_WEBHOOK_URL)),
    requiredEnv: ["TELEGRAM_BOT_TOKEN"],
    optionalEnv: ["TELEGRAM_DEFAULT_CHAT_ID", "TELEGRAM_WEBHOOK_URL", "TELEGRAM_WEBHOOK_SECRET"],
  },
  call: {
    provider: "twilio_voice",
    configured: Boolean(
      cleanEnv(process.env.TWILIO_ACCOUNT_SID) &&
        cleanEnv(process.env.TWILIO_AUTH_TOKEN) &&
        cleanEnv(process.env.TWILIO_CALL_FROM)
    ),
    requiredEnv: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_CALL_FROM"],
    optionalEnv: ["TWILIO_CALL_WEBHOOK_URL"],
  },
  
});

module.exports = {
  sendEmail,
  sendSms,
  sendTelegram,
  sendTelegramTyping,
  sendTelegramLocation,
  sendTelegramContact,
  sendTelegramVenue,
  forwardTelegramMessage,
  sendTelegramPoll,
  downloadTelegramFile,
  triggerCall,
  getIntegrationStatus,
  checkTelegramHealth,
  getTelegramWebhookInfo,
  setTelegramWebhook,
  logTelegramEvent,
  sanitizeTelegramText,
  splitTelegramText,
  formatE164,
  inferMimeTypeFromUrl,
  normalizeTelegramChatId,
  isTelegramConfigured,
  getTelegramBotToken,
};
