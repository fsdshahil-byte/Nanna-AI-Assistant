const fetch = require("node-fetch");

const connectedSockets = new Map();

// ── WiFi REST Commands ────────────────────────────────────────
const WIFI_COMMANDS = {
  on: (device) => buildTasmotaUrl(device, { Power: "ON" }),
  off: (device) => buildTasmotaUrl(device, { Power: "OFF" }),
  brightness: (device, value) => buildTasmotaUrl(device, { Dimmer: Math.round(value * 2.55) }),
  temperature: (device, value) => buildTasmotaUrl(device, { Color: `${value},100,100"` }),
  volume: (device, value) => buildTasmotaUrl(device, { Volume: Math.round(value * 100) }),
};

function buildTasmotaUrl(device, params) {
  const baseUrl = device.wifiUrl || device.ipAddress;
  if (!baseUrl) throw new Error("WiFi device missing URL/IP address");
  
  const user = device.wifiUser || "";
  const password = device.wifiPassword || "";
  
  let url = `${baseUrl}/cm?user=${user}&password=${password}&cmnd=`;
  
  const commands = Object.entries(params).map(([key, value]) => `${key} ${value}`);
  url += encodeURIComponent(commands.join(";"));
  
  return url;
}

async function wifiSend(device, command, value) {
  try {
    let url;
    
    if (device.protocol === "tasmota") {
      url = WIFI_COMMANDS[command]?.(device, value) || buildTasmotaUrl(device, { [command]: value });
    } else {
      const baseUrl = device.wifiUrl || `http://${device.ipAddress}`;
      const endpoint = device.wifiEndpoint || `/api/${command}`;
      url = `${baseUrl}${endpoint}`;
    }
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(device.wifiUser && device.wifiPassword && {
          Authorization: `Basic ${Buffer.from(`${device.wifiUser}:${device.wifiPassword}`).toString("base64")}`
        })
      },
      body: JSON.stringify({ command, value }),
      timeout: 5000
    });
    
    if (!response.ok) {
      return { ok: false, message: `WiFi command failed: ${response.status} ${response.statusText}` };
    }
    
    const result = await response.json().catch(() => ({}));
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, message: `WiFi request failed: ${err.message}` };
  }
}

async function tasmotaSend(device, command, value) {
  return wifiSend(device, command, value);
}

// ── WebSocket Connection ──────────────────────────────────────
async function wifiWebSocket(device, onMessage, onClose) {
  const wsUrl = device.wsUrl || `ws://${device.ipAddress}:81/`;
  
  return new Promise((resolve, reject) => {
    try {
      const WebSocket = require("ws");
      const ws = new WebSocket(wsUrl);
      
      ws.on("open", () => {
        console.log(`[WiFi WS] Connected to ${device.name}`);
        connectedSockets.set(device._id, ws);
        resolve(ws);
      });
      
      ws.on("message", (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          onMessage?.(parsed);
        } catch {
          onMessage?.(data.toString());
        }
      });
      
      ws.on("close", () => {
        console.log(`[WiFi WS] Disconnected from ${device.name}`);
        connectedSockets.delete(device._id);
        onClose?.();
      });
      
      ws.on("error", (err) => {
        console.error(`[WiFi WS] Error with ${device.name}:`, err.message);
        reject(err);
      });
      
      device._ws = ws;
    } catch (err) {
      reject(err);
    }
  });
}

async function wifiWsSend(deviceId, message) {
  const ws = connectedSockets.get(deviceId);
  if (!ws || ws.readyState !== 1) {
    return { ok: false, message: "WebSocket not connected" };
  }
  
  try {
    ws.send(JSON.stringify(message));
    return { ok: true };
  } catch (err) {
    return { ok: false, message: `WS send failed: ${err.message}` };
  }
}

function wifiWsClose(deviceId) {
  const ws = connectedSockets.get(deviceId);
  if (ws) {
    ws.close();
    connectedSockets.delete(deviceId);
  }
}

async function checkWifiDevice(device) {
  try {
    const baseUrl = device.wifiUrl || `http://${device.ipAddress}`;
    const response = await fetch(`${baseUrl}/status`, {
      method: "GET",
      timeout: 3000
    });
    
    if (response.ok) {
      const status = await response.json().catch(() => null);
      return { online: true, status };
    }
    
    return { online: false, status: null };
  } catch {
    return { online: false, status: null };
  }
}

const wifiIsConnected = (deviceId) => connectedSockets.has(deviceId);

module.exports = {
  wifiSend,
  tasmotaSend,
  wifiWebSocket,
  wifiWsSend,
  wifiWsClose,
  checkWifiDevice,
  wifiIsConnected,
};