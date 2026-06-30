const Task = require("../models/Task");
const asyncHandler = require("../utils/asyncHandler");
const { createNotification } = require("../services/notificationService");

const getTasks = asyncHandler(async (req, res) => {
  const tasks = await Task.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json({ tasks });
});

const createTask = asyncHandler(async (req, res) => {
  const { title, description, priority, dueAt } = req.body;

  if (!title) {
    res.status(400);
    throw new Error("Task title is required");
  }

  const task = await Task.create({
    user: req.user._id,
    title,
    description,
    priority,
    dueAt,
  });

  await createNotification({
    user: req.user,
    title: "Task created",
    body: task.dueAt ? `${task.title} is due ${task.dueAt.toLocaleString("en-IN", { timeZone: req.user.timezone || "Asia/Kolkata" })}` : task.title,
    channel: "telegram",
    status: "unread",
    metadata: { task: task._id, alertType: "task_created" },
  });

  res.status(201).json({ message: "Task created successfully", task });
});

const updateTask = asyncHandler(async (req, res) => {
  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    req.body,
    { returnDocument: "after", runValidators: true }
  );

  if (!task) {
    res.status(404);
    throw new Error("Task not found");
  }

  await createNotification({
    user: req.user,
    title: "Task updated",
    body: task.title,
    channel: "telegram",
    status: "unread",
    metadata: { task: task._id, alertType: "task_updated" },
  });

  res.json({ message: "Task updated successfully", task });
});

const deleteTask = asyncHandler(async (req, res) => {
  const task = await Task.findOneAndDelete({ _id: req.params.id, user: req.user._id });

  if (!task) {
    res.status(404);
    throw new Error("Task not found");
  }

  res.json({ message: "Task deleted successfully" });
});

const toggleTaskStatus = asyncHandler(async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, user: req.user._id });

  if (!task) {
    res.status(404);
    throw new Error("Task not found");
  }

  task.status = task.status === "completed" ? "pending" : "completed";
  await task.save();

  await createNotification({
    user: req.user,
    title: "Task status updated",
    body: `${task.title}: ${task.status}`,
    channel: "telegram",
    status: "unread",
    metadata: { task: task._id, alertType: "task_status" },
  });

  res.json({ message: "Task status updated successfully", task });
});

module.exports = { getTasks, createTask, updateTask, deleteTask, toggleTaskStatus };
