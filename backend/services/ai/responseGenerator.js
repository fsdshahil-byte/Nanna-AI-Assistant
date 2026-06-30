const { fetchLiveInfo } = require("../liveInfoService");

const shouldUseActionResponse = (intentName) =>
  !["general_chat", "information_query", "skill_request"].includes(intentName);

const stripWakeWord = (message = "") =>
  String(message)
    .replace(/\bhey\s+nanna\b[,\s]*/gi, "")
    .replace(/\bnanna\b[,\s]*/gi, "")
    .replace(/\s+/g, " ")
    .trim();

const toChatMessages = ({ message, user, recentMessages, liveInfo }) => {
  const history = recentMessages.map((item) => ({
    role: item.role === "assistant" ? "assistant" : "user",
    content: item.content,
  }));
  const memory = (user?.memory || [])
    .slice(-12)
    .map((item) => `${item.key}: ${item.value}`)
    .join("; ");

  return [
    {
      role: "system",
      content: [
        "You are NANNA, a warm, capable AI Life OS assistant with an Alexa-like voice assistant style.",
        "Answer almost any normal user question conversationally: general knowledge, learning, coding, planning, writing, math, explanations, recommendations, and everyday help.",
        "Be fast, sweet, and useful by default. Use 2 to 5 short sentences unless the user asks for detail.",
        "For voice use, lead with the answer, avoid long markdown, and keep follow-up questions to one clear question.",
        "If the user asks for an action, either confirm the completed action or explain what detail is missing.",
        "If live information is provided, use it first and mention when it was checked. If live information is marked stale, say that it is the last saved live result. If no live information is provided for current real-time facts, say what you know may be time-sensitive and give the best stable answer.",
        "Do not say you only support tasks or reminders. You can discuss general knowledge, planning, coding, learning, ideas, and everyday help.",
        "Never ask for or store email/social account passwords. For account access, ask the user to connect OAuth or app-specific credentials in settings.",
        `Current date/time: ${new Date().toISOString()}.`,
        `User name: ${user?.name || "User"}.`,
        `Known user details: ${memory || "none saved yet"}.`,
        `Preferred style: ${user?.preferences?.communicationStyle || "friendly"}.`,
        liveInfo
          ? `Live information checked at ${liveInfo.checkedAt} from ${liveInfo.source}${liveInfo.stale ? " (stale cached result)" : ""}: ${liveInfo.summary}${liveInfo.url ? ` Source URL: ${liveInfo.url}` : ""}`
          : "",
      ].join(" "),
    },
    ...history,
    { role: "user", content: message },
  ];
};

const getUserTimeZone = (user) => user?.timezone || process.env.DEFAULT_TIMEZONE || "Asia/Kolkata";

const formatLocalDate = ({ date = new Date(), timeZone, includeTime = false }) =>
  new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone,
  }).format(date);

const formatLocalTime = ({ date = new Date(), timeZone }) =>
  new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone,
  }).format(date);

const trySolveMath = (message) => {
  const normalized = message
    .toLowerCase()
    .replace(/what is|calculate|solve|please|nanna|hey/gi, "")
    .replace(/plus/g, "+")
    .replace(/minus/g, "-")
    .replace(/times|multiplied by|x/g, "*")
    .replace(/divided by|over/g, "/")
    .replace(/percent of/g, "% of")
    .trim();

  const percent = normalized.match(/^(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)$/);
  if (percent) {
    const answer = (Number(percent[1]) / 100) * Number(percent[2]);
    return `${percent[1]}% of ${percent[2]} is ${Number(answer.toFixed(8))}.`;
  }

  if (!/^[\d\s+\-*/().]+$/.test(normalized) || !/[+\-*/]/.test(normalized)) return null;

  try {
    const answer = Function(`"use strict"; return (${normalized});`)();
    if (Number.isFinite(answer)) return `The answer is ${Number(answer.toFixed(8))}.`;
  } catch {
    return null;
  }

  return null;
};

const localFallbackResponse = ({ message, user }) => {
  const text = message.toLowerCase();
  const clean = stripWakeWord(message);
  const timeZone = getUserTimeZone(user);
  const mathAnswer = trySolveMath(clean);

  if (mathAnswer) return mathAnswer;

  if (/\b(time|current time|what time)\b/.test(text)) {
    return `It is ${formatLocalTime({ timeZone })}.`;
  }

  if (/\b(date|today|day is it)\b/.test(text)) {
    return `Today is ${formatLocalDate({ timeZone })}.`;
  }

  if (/\b(who are you|what are you|your name)\b/.test(text)) {
    return "I am NANNA, your personal AI assistant. I can answer questions, explain ideas, help with coding and writing, manage tasks and reminders, control smart devices, and run routines.";
  }

  if (/\b(help|what can you do)\b/.test(text)) {
    return "You can ask me questions like Alexa, and I can also create tasks, set reminders, manage alarms, control devices, run routines, prepare messages, and help with coding or study. For the best answers to everything, keep the AI provider key configured in backend/.env.";
  }

  if (/\b(hi|hello|hey|good morning|good evening)\b/.test(text)) {
    return "Hi, I am here. Tell me what you need, and I will help you right away.";
  }

  if (/\b(thank|thanks)\b/.test(text)) {
    return "You are welcome. I am right here when you need me.";
  }

  if (/\b(what is ai|explain ai|artificial intelligence)\b/.test(text)) {
    return "AI means software that can understand information, learn patterns, and help with decisions or tasks. In NANNA, AI is the brain that understands your command and chooses what to do next.";
  }

  if (/\b(weather|news|sports|score|latest|today's)\b/.test(text)) {
    return "I can answer live-style questions when my AI provider is reachable. Right now I do not have a live data tool in offline mode, so weather, news, and scores may need provider access or a dedicated API.";
  }

  if (/\b(javascript|react|node|mongodb|express)\b/.test(text)) {
    return "I can help with that. Ask me the exact coding question, and I will explain the idea, the fix, or the next step clearly.";
  }

  return `I heard you: "${clean}". I can answer basic things offline, and with the AI provider connected I can handle open-ended questions much more like Alexa.`;
};

const localFallbackResponseWithLiveInfo = ({ message, user, liveInfo }) => {
  if (liveInfo?.summary) {
    const checked = new Date(liveInfo.checkedAt).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: getUserTimeZone(user),
    });
    const freshness = liveInfo.stale ? "Last saved live result" : "Checked";
    return `${liveInfo.summary} ${freshness} ${checked}${liveInfo.source ? ` via ${liveInfo.source}` : ""}.`;
  }
  return localFallbackResponse({ message, user });
};

const getProviderConfig = () => {
  const provider = (process.env.AI_PROVIDER || "openai").trim().toLowerCase();

  if (provider === "groq") {
    return {
      name: "Groq",
      keyName: "GROQ_API_KEY",
      apiKey: process.env.GROQ_API_KEY,
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      modelKeyName: "GROQ_MODEL",
    };
  }

  return {
    name: "OpenAI",
    keyName: "OPENAI_API_KEY",
    apiKey: process.env.OPENAI_API_KEY,
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    modelKeyName: "OPENAI_MODEL",
  };
};

const getProviderErrorReply = ({ status, error, provider }) => {
  const code = error?.code || error?.type;

  if (status === 401 || code === "invalid_api_key") {
    return `My AI key was rejected. Please add a valid ${provider.name} API key as ${provider.keyName} in backend/.env, then restart the backend.`;
  }

  if (status === 429 && code === "insufficient_quota") {
    return `My AI brain is connected, but the ${provider.name} account has no available quota right now. Please check billing or add credits, then try again.`;
  }

  if (status === 429) {
    return `My AI brain is being rate limited by ${provider.name} right now. Please wait a moment and try again.`;
  }

  if (status === 404 || code === "model_not_found") {
    return `The selected ${provider.name} model is not available for this key. Please update ${provider.modelKeyName} in backend/.env.`;
  }

  return `I reached ${provider.name}, but the request was rejected. Please check the backend terminal for the provider error details.`;
};

const generateAssistantResponse = async ({
  message,
  intent,
  actionResult,
  user,
  recentMessages = [],
}) => {
  if (actionResult?.response && shouldUseActionResponse(intent.name)) {
    return { content: actionResult.response, liveInfo: null };
  }

  const liveInfo =
    intent.name === "information_query"
      ? await fetchLiveInfo(actionResult?.data?.topic || intent.entities?.topic || message)
      : null;

  const provider = getProviderConfig();

  if (!provider.apiKey) {
    return {
      content: localFallbackResponseWithLiveInfo({ message, intent, user, liveInfo }),
      liveInfo,
    };
  }

  try {
    const response = await fetch(provider.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: toChatMessages({ message, user, recentMessages, liveInfo }),
        temperature: 0.6,
        max_tokens: 350,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      console.error(`${provider.name} response error:`, {
        status: response.status,
        type: errorBody?.error?.type,
        code: errorBody?.error?.code,
        message: errorBody?.error?.message,
      });
      return {
        content: getProviderErrorReply({
          status: response.status,
          error: errorBody?.error,
          provider,
        }),
        liveInfo,
      };
    }

    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || "I am here. Ask me anything.",
      liveInfo,
    };
  } catch (error) {
    console.error(`${provider.name} request failed:`, error.message);
    return {
      content:
        "I tried to answer with my AI brain, but I could not reach the AI provider right now. Please check the backend network and API key.",
      liveInfo,
    };
  }
};

module.exports = { generateAssistantResponse };
