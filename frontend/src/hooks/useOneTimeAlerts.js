import { useEffect, useRef } from "react";
import { ringInBrowser } from "../utils/browserAlerts";

const FIRED_ALERTS_STORAGE_KEY = "nanna_fired_alert_ids";

const getStoredFiredAlertIds = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(FIRED_ALERTS_STORAGE_KEY) || "[]"));
  } catch {
    return new Set();
  }
};

const storeFiredAlertId = (id) => {
  const ids = getStoredFiredAlertIds();
  ids.add(id);
  localStorage.setItem(FIRED_ALERTS_STORAGE_KEY, JSON.stringify(Array.from(ids).slice(-300)));
};

const getChannelLabel = (channel) => {
  if (channel === "sms") return "SMS";
  if (channel === "telegram") return "Telegram message";
  if (channel === "email") return "mail";
  if (channel === "call") return "missed call";
  return "notification";
};

const buildIncomingSummary = (notifications) => {
  const counts = notifications.reduce((acc, item) => {
    acc[item.channel] = (acc[item.channel] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([channel, count]) => `${count} ${getChannelLabel(channel)}${count > 1 && channel !== "sms" ? "s" : ""}`)
    .join(", ");
};

export const useOneTimeAlerts = ({ token, notifications, markNotificationRead, onIncomingAlert }) => {
  const firedAlertIdsRef = useRef(getStoredFiredAlertIds());

  useEffect(() => {
    if (!token) return;

    const dueNotifications = notifications.filter(
      (notification) => notification.status === "unread" && notification.metadata?.ring
    );
    const incomingNotifications = dueNotifications.filter((notification) => notification.metadata?.promptOpen);
    const regularNotifications = dueNotifications.filter((notification) => !notification.metadata?.promptOpen);

    if (incomingNotifications.length > 0) {
      const key = `incoming:${incomingNotifications.map((item) => item._id).join(":")}`;
      if (!firedAlertIdsRef.current.has(key)) {
        firedAlertIdsRef.current.add(key);
        storeFiredAlertId(key);
        const summary = buildIncomingSummary(incomingNotifications);
        const latest = incomingNotifications[0];
        const body = latest?.channel === "telegram"
          ? `${latest.title}: ${latest.body || "New Telegram message"}`
          : `You have ${summary}.`;
        ringInBrowser("NANNA alert", body);
        onIncomingAlert?.(incomingNotifications);
      }
    }

    regularNotifications.forEach((notification) => {
      const key = `notification:${notification._id}`;
      if (firedAlertIdsRef.current.has(key)) return;

      firedAlertIdsRef.current.add(key);
      storeFiredAlertId(key);
      ringInBrowser(notification.title, notification.body || "NANNA alert");
      markNotificationRead(notification._id).catch(() => undefined);
    });
  }, [token, notifications, markNotificationRead, onIncomingAlert]);
};
