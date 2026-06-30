const Routine = require("../models/Routine");
const asyncHandler = require("../utils/asyncHandler");
const { runRoutineWithNotification } = require("../services/routineService");

const getRoutines = asyncHandler(async (req, res) => {
  const routines = await Routine.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json({ routines });
});

const createRoutine = asyncHandler(async (req, res) => {
  const { name, triggerPhrase, actions } = req.body;
  if (!name || !triggerPhrase) {
    res.status(400);
    throw new Error("Routine name and trigger phrase are required");
  }

  const routine = await Routine.create({
    user: req.user._id,
    name,
    triggerPhrase,
    actions,
  });

  res.status(201).json({ message: "Routine created successfully", routine });
});

const runRoutineById = asyncHandler(async (req, res) => {
  const routine = await Routine.findOne({ _id: req.params.id, user: req.user._id });
  if (!routine) {
    res.status(404);
    throw new Error("Routine not found");
  }

  const result = await runRoutineWithNotification({ userId: req.user._id, phrase: routine.triggerPhrase });
  res.json(result);
});

module.exports = { getRoutines, createRoutine, runRoutineById };
