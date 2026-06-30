const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
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
    body: {
      type: String,
      trim: true,
      default: "",
    },
    channel: {
      type: String,
      enum: ["in_app", "email", "sms", "telegram", "call"],
      default: "in_app",
    },
    status: {
      type: String,
      enum: ["unread", "read", "sent", "failed"],
      default: "unread",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);
