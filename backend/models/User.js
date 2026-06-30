const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    telegramChatId: {
      type: String,
      trim: true,
      default: "",
    },
    telegramId: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    telegramUsername: {
      type: String,
      trim: true,
      default: "",
    },
    telegramFirstName: {
      type: String,
      trim: true,
      default: "",
    },
    telegramLastName: {
      type: String,
      trim: true,
      default: "",
    },
    telegramChat: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    timezone: {
      type: String,
      default: "Asia/Kolkata",
    },
    preferences: {
      assistantName: {
        type: String,
        default: "NANNA",
      },
      communicationStyle: {
        type: String,
        enum: ["friendly", "professional", "concise"],
        default: "friendly",
      },
      voiceEnabled: {
        type: Boolean,
        default: false,
      },
    },
    memory: [
      {
        key: {
          type: String,
          required: true,
        },
        value: {
          type: String,
          required: true,
        },
        source: {
          type: String,
          default: "user",
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);
