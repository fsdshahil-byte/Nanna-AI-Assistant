# NANNA Telegram Backend

Telegram is the primary bot channel for NANNA.

## Webhook

- `GET /api/telegram/status` checks bot health and webhook status.
- `POST /api/telegram/setup-webhook` registers `TELEGRAM_WEBHOOK_URL` with Telegram.
- `POST /api/telegram/webhook` receives Telegram updates.

The webhook validates `x-telegram-bot-api-secret-token` when `TELEGRAM_WEBHOOK_SECRET` is configured.

## Commands

- `/start` connects the current Telegram chat and shows the chat ID.
- `/help` lists commands.
- `/status` returns bot, webhook, account, and chat status.
- `/ai <message>` sends a prompt through NANNA's AI pipeline.
- `/reminders` lists upcoming reminders.
- `/tasks` lists pending tasks.
- `/profile` shows saved Telegram profile mapping.

## Delivery

The backend sends Telegram messages through the shared communication service. It supports:

- `sendMessage`
- `sendPhoto`
- `sendDocument`
- `sendVoice`
- `sendAudio`
- `sendVideo`
- `sendLocation`
- `sendContact`
- `sendVenue`
- `sendPoll`
- `forwardMessage`
- inline buttons and menus
- emojis and plain Unicode text
- optional Markdown/HTML parse modes
- typing indicators
- long response splitting
- rate-limit retry handling

Notifications, reminders, alarms, task deadlines, routines, automation events, and AI proactive alerts use the notification service, which stores the existing `Notification` record and delivers through Telegram when a chat ID is connected.

## Incoming Media

Incoming Telegram media is downloaded with `getFile` into `backend/uploads/telegram` and attached to the existing AI conversation metadata.

Supported inbound media:

- photos and screenshots
- documents such as PDF, DOCX, XLSX, ZIP
- audio files
- voice notes
- videos and screen recordings
- animations, stickers, and video notes
- locations and venues
- contacts
- polls and poll answers
- callback button data
- dice and successful payment payloads

Voice/audio messages are transcribed when an existing OpenAI or Groq transcription key is available. The transcript is sent into NANNA's AI conversation pipeline. Other media is stored and passed into the AI context with file type, name, size, URL, caption, and Telegram file metadata.

## Calling

Telegram Bot API does not support starting real Telegram voice/video calls. NANNA supports Telegram voice notes, audio files, video files, and video notes as the bot-compatible replacement. Real phone calls remain a separate voice-provider feature.
