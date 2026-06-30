const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const cors = require("cors");
const http = require("http");

const connectDB = require("./config/db");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

dotenv.config({ path: path.join(__dirname, ".env"), quiet: true });

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// routes
const faceroutes = require("./routes/faceRoutes");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const taskRoutes = require("./routes/taskRoutes");
const aiRoutes = require("./routes/aiRoutes");
const reminderRoutes = require("./routes/reminderRoutes");
const automationRoutes = require("./routes/automationRoutes");
const deviceRoutes = require("./routes/deviceRoutes");
const skillRoutes = require("./routes/skillRoutes");
const routineRoutes = require("./routes/routineRoutes");
const alarmRoutes = require("./routes/alarmRoutes");
const mediaRoutes = require("./routes/mediaRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const infoRoutes = require("./routes/infoRoutes");
const telegramRoutes = require("./routes/telegramRoutes");
const inboundRoutes = require("./routes/inboundRoutes");

const { ensureUploadFolder } = require("./controllers/uploadController");
const { initRealtime } = require("./services/realtimeService");

ensureUploadFolder();

// routes mounting
app.use("/api/face", faceroutes);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/reminders", reminderRoutes);
app.use("/api/automation", automationRoutes);
app.use("/api/devices", deviceRoutes);
app.use("/api/skills", skillRoutes);
app.use("/api/routines", routineRoutes);
app.use("/api/alarms", alarmRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/info", infoRoutes);
app.use("/api/telegram", telegramRoutes);
app.use("/api/inbound", inboundRoutes);

app.get("/", (req, res) => {
  res.json({
    name: "NANNA AI Backend",
    status: "running",
    message: "NANNA is ready.",
  });
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

/* 🚨 IMPORTANT FIX */
const server = http.createServer(app);

const startServer = async () => {
  try {
    await connectDB();

    const { startScheduler } = require("./services/scheduler");
    startScheduler();

    // 🔥 INIT SOCKET HERE (ONLY ONCE)
    initRealtime(server);

    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(
        `AI provider: ${(process.env.AI_PROVIDER || "openai").trim().toLowerCase()}`
      );
    });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

startServer();