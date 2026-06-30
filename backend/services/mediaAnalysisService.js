const fs = require("fs/promises");
const path = require("path");

const cleanEnv = (value = "") => String(value || "").trim();

const getProvider = () => {
  const provider = cleanEnv(process.env.AI_PROVIDER || "groq").toLowerCase();
  if (provider === "openai" && cleanEnv(process.env.OPENAI_API_KEY)) {
    return {
      name: "OpenAI",
      key: cleanEnv(process.env.OPENAI_API_KEY),
      transcriptionEndpoint: "https://api.openai.com/v1/audio/transcriptions",
      transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe",
    };
  }
  if (cleanEnv(process.env.GROQ_API_KEY)) {
    return {
      name: "Groq",
      key: cleanEnv(process.env.GROQ_API_KEY),
      transcriptionEndpoint: "https://api.groq.com/openai/v1/audio/transcriptions",
      transcriptionModel: process.env.GROQ_TRANSCRIPTION_MODEL || "whisper-large-v3-turbo",
    };
  }
  return null;
};

const transcribeAudioFile = async ({ storedPath }) => {
  const provider = getProvider();
  if (!provider || !storedPath) return null;

  try {
    const buffer = await fs.readFile(storedPath);
    const formData = new FormData();
    formData.append("model", provider.transcriptionModel);
    formData.append("file", new Blob([buffer]), path.basename(storedPath));

    const response = await fetch(provider.transcriptionEndpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.key}` },
      body: formData,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(`${provider.name} transcription failed:`, data.error?.message || response.statusText);
      return null;
    }
    return String(data.text || "").trim() || null;
  } catch (error) {
    console.error("Audio transcription failed:", error.message);
    return null;
  }
};

const buildMediaPrompt = async ({ text, media, download }) => {
  if (!media) return text;

  const file = download?.file;
  let transcript = null;
  if (["voice", "audio"].includes(media.type) && file?.storedPath) {
    transcript = await transcribeAudioFile({ storedPath: file.storedPath });
  }

  const mediaLines = [
    `User sent a Telegram ${media.type}.`,
    media.fileName ? `File name: ${media.fileName}.` : "",
    media.mimeType ? `MIME type: ${media.mimeType}.` : "",
    file?.url ? `Stored URL: ${file.url}.` : "",
    file?.size ? `File size: ${file.size} bytes.` : "",
    transcript ? `Voice/audio transcript: ${transcript}` : "",
    text && !/^\[[^\]]+ received\]/.test(text) ? `User caption/message: ${text}` : "",
  ].filter(Boolean);

  if (transcript) return transcript;
  return `${mediaLines.join("\n")}\n\nAcknowledge receipt and help the user with the file. If analysis requires vision/video parsing not available in text context, say what you can infer from the metadata and ask one clear follow-up.`;
};

module.exports = { buildMediaPrompt, transcribeAudioFile };
