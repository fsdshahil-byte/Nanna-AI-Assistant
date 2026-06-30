const bcrypt = require("bcryptjs");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { createToken } = require("../utils/token");

const formatUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  telegramChatId: user.telegramChatId || "",
  telegramId: user.telegramId || "",
  telegramUsername: user.telegramUsername || "",
  telegramFirstName: user.telegramFirstName || "",
  telegramLastName: user.telegramLastName || "",
  telegramChat: user.telegramChat || user.telegramChatId || "",
  timezone: user.timezone,
  preferences: user.preferences,
  memory: user.memory || [],
});

const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;

  if (!name || !email || !password) {
    res.status(400);
    throw new Error("Please provide name, email, and password");
  }

  const userExists = await User.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error("User already exists");
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const user = await User.create({
    name,
    email,
    phone,
    password: hashedPassword,
  });

  res.status(201).json({
    message: "Registration successful",
    token: createToken(user._id),
    user: formatUser(user),
  });
});

const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400);
    throw new Error("Please provide email and password");
  }

  const user = await User.findOne({ email });
  if (!user) {
    res.status(400);
    throw new Error("Invalid email or password");
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    res.status(400);
    throw new Error("Invalid email or password");
  }

  res.json({
    message: "Login successful",
    token: createToken(user._id),
    user: formatUser(user),
  });
});

module.exports = { registerUser, loginUser, formatUser };
