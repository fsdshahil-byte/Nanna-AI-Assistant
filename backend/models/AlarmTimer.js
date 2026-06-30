const mongoose = require("mongoose");

const alarmTimerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["alarm", "timer"],
      required: true,
    },
    label: {
      type: String,
      default: "NANNA alert",
    },
    triggerAt: {
      type: Date,
      required: true,
    },
    durationSeconds: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["scheduled", "completed", "cancelled"],
      default: "scheduled",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AlarmTimer", alarmTimerSchema);
