const mongoose = require("mongoose");

const reminderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    remindAt: {
      type: Date,
      required: true,
    },
    channel: {
      type: String,
      enum: ["in_app", "email", "sms", "telegram"],
      default: "in_app",
    },
    status: {
      type: String,
      enum: ["scheduled", "sent", "cancelled", "failed"],
      default: "scheduled",
    },
    sentAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Reminder", reminderSchema);
