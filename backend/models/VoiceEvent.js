const mongoose = require("mongoose");

const voiceEventSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    transcript: {
      type: String,
      required: true,
    },
    wakeWordDetected: {
      type: Boolean,
      default: false,
    },
    confidence: {
      type: Number,
      default: 0,
    },
    muted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("VoiceEvent", voiceEventSchema);
