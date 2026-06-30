const mongoose = require("mongoose");

const routineSchema = new mongoose.Schema(
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
    triggerPhrase: {
      type: String,
      required: true,
      trim: true,
    },
    actions: [
      {
        type: {
          type: String,
          enum: ["device", "say", "task", "reminder", "media"],
          required: true,
        },
        payload: {
          type: mongoose.Schema.Types.Mixed,
          default: {},
        },
      },
    ],
    enabled: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Routine", routineSchema);
