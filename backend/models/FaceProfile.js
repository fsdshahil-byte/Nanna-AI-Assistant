const mongoose = require("mongoose");

const faceSchema = new mongoose.Schema({
  name: {
    type:     String,
    required: true,
    trim:     true,
  },
  relationship: {
    type:    String,
    default: "Other",
    enum:    ["Me", "Spouse", "Parent", "Child", "Sibling", "Grandparent", "Friend", "Other"],
  },
  descriptor: {
    type:     [Number],
    required: true,
    validate: {
      validator: (v) => Array.isArray(v) && v.length === 128,
      message:   "Descriptor must be an array of exactly 128 floats.",
    },
  },
  createdAt: {
    type:    Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Face", faceSchema);