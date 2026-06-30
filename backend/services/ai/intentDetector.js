const stripWakeWord = (message = "") =>
  message
    .replace(/\bhey\s+nanna\b[,\s]*/gi, "")
    .replace(/\bnanna\b[,\s]*/gi, "")
    .replace(/\s+/g, " ")
    .trim();

const extractNumber = (text) => {
  const match = text.match(/\b(\d+)\b/);
  return match ? Number(match[1]) : null;
};

const extractDeviceName = (text) => {
  const knownTypes = ["light", "lights", "fan", "ac", "air conditioner", "tv", "camera", "speaker"];
  const found = knownTypes.find((type) => text.includes(type));
  return found ? found.replace("lights", "light") : "device";
};

const hasDeviceWord = (text) =>
  /\b(light|lights|fan|ac|air conditioner|tv|camera|speaker|device|devices)\b/.test(text);

const hasMediaWord = (text) =>
  /\b(play|pause|resume|skip|music|song|songs|playlist|media|speaker|youtube|spotify|camera|photo|picture|video|record)\b/.test(text);

const extractPhoneNumber = (text) => {
  const match = text.match(/(?:\+?\d[\d\s-]{7,}\d)/);
  return match ? match[0].replace(/[^\d+]/g, "") : null;
};

const extractEmail = (text) => text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || null;

const detectIntent = (message = "") => {
  const cleanedMessage = stripWakeWord(message);
  const text = cleanedMessage.toLowerCase().trim();
  const phoneNumber = extractPhoneNumber(text);
  const email = extractEmail(cleanedMessage);

  if (!text) {
    return {
      name: "wake_word",
      confidence: 1,
      entities: {},
      requiresFollowUp: true,
    };
  }

  if (/\b(show|list|get|what are)\b.*\b(tasks|todos|to-dos)\b/.test(text)) {
    return { name: "show_tasks", confidence: 0.9, entities: {} };
  }

  if (/\b(create|add|make|new)\b.*\b(task|todo|to-do)\b/.test(text)) {
    return {
      name: "create_task",
      confidence: 0.85,
      entities: {
        title: cleanedMessage
          .replace(/^(create|add|make|new)\s+(a\s+)?(task|todo|to-do)\s*/i, "")
          .trim(),
      },
    };
  }

  if (/\b(delete|remove)\b.*\b(task|todo|to-do)\b/.test(text)) {
    return { name: "delete_task", confidence: 0.65, entities: {} };
  }

  if (/\b(update|edit|change|complete|finish|done)\b.*\b(task|todo|to-do)\b/.test(text)) {
    return { name: "update_task", confidence: 0.7, entities: { status: "completed" } };
  }

  if (/\b(remind|reminder)\b/.test(text)) {
    return { name: "set_reminder", confidence: 0.75, entities: { title: cleanedMessage } };
  }

  if (/\b(password|pass)\b/.test(text) && /\b(mail|email|gmail|account)\b/.test(text)) {
    return { name: "unsafe_credential", confidence: 0.92, entities: {} };
  }

  if (/^(emails?|mails?|gmail|inbox)$/.test(text)) {
    return { name: "email_access", confidence: 0.78, entities: {} };
  }

  if (/^(phone calls?|calls?|dial)$/.test(text)) {
    return { name: "make_call", confidence: 0.74, entities: { phoneNumber } };
  }

  if (/^(sms|text messages?)$/.test(text)) {
    return { name: "send_sms", confidence: 0.74, entities: { phoneNumber } };
  }

  if (/^telegram$/.test(text)) {
    return { name: "send_telegram", confidence: 0.74, entities: { phoneNumber } };
  }

  if (/^(notifications?|alerts?)$/.test(text)) {
    return { name: "create_notification", confidence: 0.74, entities: { title: cleanedMessage } };
  }

  if (/^(reminders?)$/.test(text)) {
    return { name: "set_reminder", confidence: 0.72, entities: { title: cleanedMessage } };
  }

  if (/\b(access|read|check|open|connect)\b.*\b(mails?|emails?|gmail|inbox)\b/.test(text)) {
    return { name: "email_access", confidence: 0.84, entities: {} };
  }

  if (/\b(send|write|draft)\b.*\b(email|mail)\b/.test(text)) {
    const subject =
      cleanedMessage.match(/\bsubject\s+(.+?)(?=\s+(?:message|body|saying|that says)\b|$)/i)?.[1]?.trim() ||
      null;
    return { name: "send_email", confidence: 0.8, entities: { email, subject } };
  }

  if (/\b(sms|text message|message)\b/.test(text) && (/\b(send|write)\b/.test(text) || phoneNumber)) {
    return { name: "send_sms", confidence: 0.82, entities: { phoneNumber } };
  }

  if (/\btelegram\b/.test(text) && (/\b(send|message|text)\b/.test(text) || phoneNumber)) {
    return { name: "send_telegram", confidence: 0.82, entities: { phoneNumber } };
  }

  if (/\b(notify|notification|alert me|alert)\b/.test(text)) {
    return { name: "create_notification", confidence: 0.78, entities: { title: cleanedMessage } };
  }

  if (/\b(call|phone|dial)\b/.test(text) || phoneNumber) {
    return { name: "make_call", confidence: phoneNumber ? 0.88 : 0.74, entities: { phoneNumber } };
  }

  if (
    /\b(save|remember|store|my name is|i am|i'm|i work|my mail|my email|personal info|personal details)\b/.test(text)
  ) {
    return { name: "save_personal_info", confidence: 0.86, entities: { text: cleanedMessage } };
  }

  if (/\b(my details|my dstails|my info|my personal info|what do you know about me)\b/.test(text)) {
    return { name: "show_personal_info", confidence: 0.86, entities: {} };
  }

  if (/\b(show|list|get|what|when)\b.*\b(alarms?|alrms?|timers?)\b/.test(text)) {
    return { name: "show_alarms", confidence: 0.86, entities: {} };
  }

  if (/\b(alarms?|alrms?)\b/.test(text)) {
    return { name: "set_alarm", confidence: 0.78, entities: { label: cleanedMessage } };
  }

  if (/\b(timer)\b/.test(text)) {
    return {
      name: "set_timer",
      confidence: 0.78,
      entities: { label: cleanedMessage, minutes: extractNumber(text) || 5 },
    };
  }

  if (/\b(turn|switch)\b.*\b(on|off)\b/.test(text) && hasDeviceWord(text)) {
    return {
      name: "control_device",
      confidence: 0.9,
      entities: {
        deviceName: extractDeviceName(text),
        command: /\boff\b/.test(text) ? "off" : "on",
      },
    };
  }

  if (
    /\b(brightness|volume|temperature)\b/.test(text) &&
    (hasDeviceWord(text) || /\b(set|change|increase|decrease|raise|lower)\b/.test(text))
  ) {
    const command = text.includes("brightness")
      ? "brightness"
      : text.includes("temperature")
        ? "temperature"
        : "volume";
    return {
      name: "control_device",
      confidence: 0.82,
      entities: { deviceName: extractDeviceName(text), command, value: extractNumber(text) || 50 },
    };
  }

  if (/\b(good morning|good night|run routine|start routine)\b/.test(text)) {
    return { name: "run_routine", confidence: 0.84, entities: { phrase: text } };
  }

  if (hasMediaWord(text)) {
    const command = /\b(open|start)\b.*\bcamera\b/.test(text)
      ? "open_camera"
      : /\b(take|capture|click)\b.*\b(photo|picture|image)\b/.test(text)
        ? "take_photo"
        : /\b(record|capture)\b.*\b(video)\b/.test(text)
          ? "record_video"
          : text.includes("pause")
            ? "pause"
            : text.includes("resume")
              ? "resume"
              : text.includes("skip")
                ? "skip"
                : text.includes("volume")
                  ? "volume"
                  : "play";
    return {
      name: "media_control",
      confidence: 0.75,
      entities: { command, query: cleanedMessage, volume: extractNumber(text) },
    };
  }

  if (
    /\b(weather|news|sports|score|search|who is|what is|where is|when is|why is|how to|how do|how does|tell me about|explain|define|calculate|solve|capital of)\b/.test(
      text
    )
  ) {
    return { name: "information_query", confidence: 0.7, entities: { topic: cleanedMessage } };
  }

  if (/\b(update|edit|change)\b.*\b(profile|phone|email|name)\b/.test(text)) {
    return { name: "update_profile", confidence: 0.75, entities: {} };
  }

  if (/\b(open|launch|ask skill|skill)\b/.test(text)) {
    return { name: "skill_request", confidence: 0.7, entities: {} };
  }

  return { name: "general_chat", confidence: 0.5, entities: {} };
};

module.exports = { detectIntent, stripWakeWord, extractPhoneNumber };
