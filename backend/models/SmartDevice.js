const mongoose = require("mongoose");

const smartDeviceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      enum: [
        "camera",
        "speaker",
        "earphone",
        "light",
        "fan",
        "tv",
        "ac",
        "custom",
      ],
      default: "custom",
    },

    protocol: {
      type: String,
      enum: ["bluetooth", "wifi"],
      required: true,
    },

    ipAddress: {
      type: String,
      default: "",
    },

    bleServiceUUID: {
      type: String,
      default: "",
    },

    bleCharUUID: {
      type: String,
      default: "",
    },

    connectionStatus: {
      type: String,
      enum: [
        "connected",
        "connecting",
        "disconnected",
        "error",
      ],
      default: "disconnected",
    },

    state: {
      power: {
        type: Boolean,
        default: false,
      },

      volume: {
        type: Number,
        default: 50,
      },

      brightness: {
        type: Number,
        default: 100,
      },

      temperature: {
        type: Number,
        default: 24,
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "SmartDevice",
  smartDeviceSchema
);