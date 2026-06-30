const { Server } = require("socket.io");

let io;

const initRealtime = (server) => {
  if (io) return io; // 🔥 prevent double init

  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PATCH"],
    },
  });

  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);
  });

  return io;
};

const getIO = () => io;

// ── Emit dashboard changed event ──────────────────────────────
const emitDashboardChanged = (userId, payload = {}) => {
  if (!io) return;
  // Emit to all clients (frontend will filter by user)
  io.emit("dashboard:changed", {
    userId,
    timestamp: Date.now(),
    ...payload,
  });
};

// ── Emit device state change ──────────────────────────────────
const emitDeviceUpdated = (device) => {
  if (!io) return;
  io.emit("device-updated", device);
};

// ── Emit device added ─────────────────────────────────────────
const emitDeviceAdded = (device) => {
  if (!io) return;
  io.emit("device-added", device);
};

module.exports = {
  initRealtime,
  getIO,
  emitDashboardChanged,
  emitDeviceUpdated,
  emitDeviceAdded,
};
