const {
  bleConnect,
  bleDisconnect,
  bleSend,
  bleSubscribe,
  bleIsConnected,
} = require("./bluetoothService");

const {
  wifiSend,
  tasmotaSend,
  wifiWebSocket,
  wifiWsSend,
  wifiWsClose,
} = require("./wifiService");

// ── Connect ──────────────────────────────────────────────────
async function connectDevice(device) {
  switch (device.protocol) {
    case "bluetooth":
      return bleConnect(device);

    case "rest":
    case "wifi":
    case "tasmota":
      // WiFi devices don't need an explicit connect step —
      // each command opens its own HTTP request
      return { ok: true, message: "WiFi device ready." };

    case "websocket":
      return new Promise((resolve) => {
        wifiWebSocket(
          device,
          (msg) => console.log(`[WS] ${device.name}:`, msg),
          ()    => console.warn(`[WS] ${device.name} closed`)
        );
        resolve({ ok: true });
      });

    default:
      return { ok: false, message: `Protocol "${device.protocol}" not supported for real connection.` };
  }
}

// ── Send command ─────────────────────────────────────────────
async function sendCommand(device, command, value) {
  switch (device.protocol) {
    case "bluetooth":
      return bleSend(device, command, value);

    case "rest":
      return wifiSend(device, command, value);

    case "tasmota":
      return tasmotaSend(device, command, value);

    case "websocket":
      return wifiWsSend(device._id, { command, value });

    default:
      return { ok: false, message: `No real connection handler for protocol "${device.protocol}".` };
  }
}

// ── Disconnect ───────────────────────────────────────────────
function disconnectDevice(device) {
  if (device.protocol === "bluetooth") bleDisconnect(device._id);
  if (device.protocol === "websocket") wifiWsClose(device._id);
}

// ── Connection status ────────────────────────────────────────
function isConnected(device) {
  if (device.protocol === "bluetooth") return bleIsConnected(device._id);
  if (device.protocol === "websocket") {
    // wsSockets is internal — expose via a getter if needed
    return true; // assume alive unless onClose fires
  }
  return true; // HTTP devices are stateless
}

module.exports = {
  connectDevice,
  sendCommand,
  disconnectDevice,
  isConnected,
};