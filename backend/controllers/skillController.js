const Skill = require("../models/Skill");
const asyncHandler = require("../utils/asyncHandler");

const getSkills = asyncHandler(async (req, res) => {
  const skills = await Skill.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json({ skills });
});

const createSkill = asyncHandler(async (req, res) => {
  const { name, description, triggerPhrases, endpoint, manifest } = req.body;
  if (!name) {
    res.status(400);
    throw new Error("Skill name is required");
  }

  const skill = await Skill.create({
    user: req.user._id,
    name,
    description,
    triggerPhrases,
    endpoint,
    manifest,
  });

  res.status(201).json({ message: "Skill installed successfully", skill });
});

const updateSkill = asyncHandler(async (req, res) => {
  const skill = await Skill.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    req.body,
    { returnDocument: "after", runValidators: true }
  );

  if (!skill) {
    res.status(404);
    throw new Error("Skill not found");
  }

  res.json({ message: "Skill updated successfully", skill });
});

const deleteSkill = asyncHandler(async (req, res) => {
  const skill = await Skill.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!skill) {
    res.status(404);
    throw new Error("Skill not found");
  }

  res.json({ message: "Skill removed successfully" });
});

module.exports = { getSkills, createSkill, updateSkill, deleteSkill };
