const connectedDevices = new Map();

const BLE_COMMANDS = {
  on:          { value: new Uint8Array([0x01]) },
  off:         { value: new Uint8Array([0x00]) },
  brightness:  { encode: (v) => new Uint8Array([0x02, Math.round(v * 2.55)]) },
  temperature: { encode: (v) => new Uint8Array([0x03, v]) },
  volume:      { encode: (v) => new Uint8Array([0x04, v]) },
};

// ── Connect ──────────────────────────────────────────────────
async function bleConnect(device) {
  if (!navigator.bluetooth) {
    throw new Error("Web Bluetooth is not supported in this browser. Use Chrome or Edge.");
  }

  const ble = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [
      "battery_service",
      "generic_access",
      "device_information",
      "0000ffe0-0000-1000-8000-00805f9b34fb", // common custom BLE service
    ],
  });

  const server = await ble.gatt.connect();

  ble.addEventListener("gattserverdisconnected", () => {
    connectedDevices.delete(device._id);
    console.warn(`[BLE] ${device.name} disconnected`);
  });

  connectedDevices.set(device._id, { ble, server });
  return server;
}

// ── Disconnect ───────────────────────────────────────────────
function bleDisconnect(deviceId) {
  const entry = connectedDevices.get(deviceId);
  if (entry?.ble?.gatt?.connected) {
    entry.ble.gatt.disconnect();
  }
  connectedDevices.delete(deviceId);
}

// ── Send command ─────────────────────────────────────────────
async function bleSend(device, command, value) {
  let entry = connectedDevices.get(device._id);

  // Auto-reconnect if dropped
  if (!entry || !entry.ble.gatt.connected) {
    await bleConnect(device);
    entry = connectedDevices.get(device._id);
  }

  const SERVICE_UUID = device.bleServiceUUID || "0000ffe0-0000-1000-8000-00805f9b34fb";
  const CHAR_UUID    = device.bleCharUUID    || "0000ffe1-0000-1000-8000-00805f9b34fb";

  try {
    const service = await entry.server.getPrimaryService(SERVICE_UUID);
    const char    = await service.getCharacteristic(CHAR_UUID);

    const cmd = BLE_COMMANDS[command];
    let payload;

    if (cmd?.encode) {
      payload = cmd.encode(Number(value));
    } else if (cmd?.value) {
      payload = cmd.value;
    } else {
      // Fallback: send JSON string for custom commands
      payload = new TextEncoder().encode(JSON.stringify({ cmd: command, val: value ?? null }));
    }

    await char.writeValueWithResponse(payload);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: `BLE write failed: ${err.message}` };
  }
}

// ── Subscribe to notifications ───────────────────────────────
async function bleSubscribe(device, onData) {
  const entry = connectedDevices.get(device._id);
  if (!entry) throw new Error("Device not connected");

  const SERVICE_UUID = device.bleServiceUUID || "0000ffe0-0000-1000-8000-00805f9b34fb";
  const CHAR_UUID    = device.bleCharUUID    || "0000ffe1-0000-1000-8000-00805f9b34fb";

  const service = await entry.server.getPrimaryService(SERVICE_UUID);
  const char    = await service.getCharacteristic(CHAR_UUID);

  await char.startNotifications();
  char.addEventListener("characteristicvaluechanged", (e) => {
    onData(e.target.value); // DataView — decode as needed
  });
}

const bleIsConnected = (deviceId) =>
  connectedDevices.has(deviceId) && connectedDevices.get(deviceId).ble.gatt.connected;

module.exports = {
  bleConnect,
  bleDisconnect,
  bleSend,
  bleSubscribe,
  bleIsConnected,
};