const mongoose = require("mongoose");

const skillSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    triggerPhrases: {
      type: [String],
      default: [],
    },
    endpoint: {
      type: String,
      default: "",
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    manifest: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Skill", skillSchema);
