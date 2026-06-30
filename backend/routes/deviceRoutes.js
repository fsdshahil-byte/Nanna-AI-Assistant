const express = require("express");

const router = express.Router();

const {
  protect,
  ownsDevice,
} = require("../middleware/authMiddleware");

const {
  createDevice,
  getMyDevices,
  getDevice,
  updateDevice,
  deleteDevice,
  connectDevice,
  disconnectDevice,
  updateState,
  togglePower,
} = require("../controllers/deviceController");

const {
  emitDeviceUpdated,
  emitDeviceAdded,
} = require("../services/realtimeService");

router.use(protect);

router.post("/", createDevice);

router.get("/", getMyDevices);

router.get(
  "/:id",
  ownsDevice,
  getDevice
);

router.patch(
  "/:id",
  ownsDevice,
  updateDevice
);

router.delete(
  "/:id",
  ownsDevice,
  deleteDevice
);

router.post(
  "/:id/connect",
  ownsDevice,
  connectDevice
);

router.post(
  "/:id/disconnect",
  ownsDevice,
  disconnectDevice
);

router.patch(
  "/:id/state",
  ownsDevice,
  updateState
);

router.post(
  "/:id/toggle",
  ownsDevice,
  togglePower
);

// ── Real-time device command ──────────────────────────────────
const { sendCommand, isConnected } = require("../services/deviceConnectionManager");

router.post(
  "/:id/command",
  ownsDevice,
  async (req, res) => {
    try {
      const { command, value } = req.body;
      const device = req.device;

      // Send command via appropriate protocol
      const result = await sendCommand(device, command, value);

      if (result.ok) {
        // Update device state in database
        if (command === "on" || command === "off") {
          device.state.power = command === "on";
        } else if (value !== undefined) {
          device.state[command] = value;
        }
        device.markModified("state");
        await device.save();

        // Emit real-time update to all clients
        emitDeviceUpdated(device);

        res.json({ success: true, device, result });
      } else {
        res.status(500).json({ success: false, message: result.message });
      }
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// ── Get device status ─────────────────────────────────────────
router.get(
  "/:id/status",
  ownsDevice,
  async (req, res) => {
    try {
      const device = req.device;
      const connected = isConnected(device);
      res.json({
        deviceId: device._id,
        name: device.name,
        protocol: device.protocol,
        connected,
        state: device.state,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

module.exports = router;