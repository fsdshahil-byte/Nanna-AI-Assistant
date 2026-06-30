const mongoose = require("mongoose");

const liveInfoSchema = new mongoose.Schema(
  {
    query: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    source: {
      type: String,
      default: "DuckDuckGo Instant Answer",
    },
    url: {
      type: String,
      default: "",
    },
    summary: {
      type: String,
      required: true,
    },
    checkedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    stale: {
      type: Boolean,
      default: false,
    },
    raw: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

liveInfoSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

module.exports = mongoose.model("LiveInfo", liveInfoSchema);
