const Face = require("../models/FaceProfile");

const RECOGNITION_THRESHOLD = 0.50;

const euclidean = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
};

const registerFace = async (req, res) => {
  try {
    const { name, relationship, descriptor } = req.body;
    if (!name || !descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
      return res.status(400).json({ success: false, error: "name and a valid 128-float descriptor array are required." });
    }
    const existing = await Face.findOne({ name: name.trim() });
    if (existing) {
      return res.status(409).json({ success: false, error: `A face is already registered under "${name.trim()}".` });
    }
    const face = await Face.create({ name: name.trim(), relationship: relationship || "Other", descriptor, createdAt: new Date() });
    res.status(201).json({ success: true, member: { _id: face._id, name: face.name, relationship: face.relationship, createdAt: face.createdAt } });
  } catch (err) {
    console.error("[registerFace]", err);
    res.status(500).json({ success: false, error: "Server error during registration." });
  }
};

const recognizeFace = async (req, res) => {
  try {
    const { descriptor } = req.body;
    if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
      return res.status(400).json({ success: false, error: "A valid 128-float descriptor array is required." });
    }
    const faces = await Face.find({}, "name relationship descriptor").lean();
    if (faces.length === 0) return res.json({ recognized: false, reason: "No faces registered yet." });

    let best = null, bestDist = Infinity;
    for (const face of faces) {
      const dist = euclidean(descriptor, face.descriptor);
      if (dist < bestDist) { bestDist = dist; best = face; }
    }

    if (bestDist <= RECOGNITION_THRESHOLD) {
      return res.json({ recognized: true, name: best.name, relationship: best.relationship, distance: parseFloat(bestDist.toFixed(4)), confidence: Math.round((1 - bestDist) * 100) });
    }
    res.json({ recognized: false, distance: parseFloat(bestDist.toFixed(4)) });
  } catch (err) {
    console.error("[recognizeFace]", err);
    res.status(500).json({ success: false, error: "Server error during recognition." });
  }
};

const listFaces = async (req, res) => {
  try {
    const members = await Face.find({}, "name relationship createdAt").lean();
    res.json({ success: true, count: members.length, members });
  } catch (err) {
    console.error("[listFaces]", err);
    res.status(500).json({ success: false, error: "Server error fetching members." });
  }
};

const getFace = async (req, res) => {
  try {
    const face = await Face.findById(req.params.id, "name relationship createdAt").lean();
    if (!face) return res.status(404).json({ success: false, error: "Member not found." });
    res.json({ success: true, member: face });
  } catch (err) {
    console.error("[getFace]", err);
    res.status(500).json({ success: false, error: "Server error fetching member." });
  }
};

const updateFace = async (req, res) => {
  try {
    const { name, relationship } = req.body;
    const updates = {};
    if (name)         updates.name         = name.trim();
    if (relationship) updates.relationship = relationship;
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: "Provide name or relationship to update." });
    }
    const face = await Face.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true, select: "name relationship createdAt" }).lean();
    if (!face) return res.status(404).json({ success: false, error: "Member not found." });
    res.json({ success: true, member: face });
  } catch (err) {
    console.error("[updateFace]", err);
    res.status(500).json({ success: false, error: "Server error updating member." });
  }
};

const removeFace = async (req, res) => {
  try {
    const face = await Face.findByIdAndDelete(req.params.id);
    if (!face) return res.status(404).json({ success: false, error: "Member not found." });
    res.json({ success: true, message: `"${face.name}" has been removed.` });
  } catch (err) {
    console.error("[removeFace]", err);
    res.status(500).json({ success: false, error: "Server error removing member." });
  }
};

const resetFaces = async (req, res) => {
  try {
    const result = await Face.deleteMany({});
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    console.error("[resetFaces]", err);
    res.status(500).json({ success: false, error: "Server error during reset." });
  }
};

module.exports = { registerFace, recognizeFace, listFaces, getFace, updateFace, removeFace, resetFaces };