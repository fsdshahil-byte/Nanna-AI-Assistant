const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { formatUser } = require("./authController");

const getProfile = asyncHandler(async (req, res) => {
  res.json({
    message: "Profile fetched successfully",
    user: formatUser(req.user),
  });
});

const updateProfile = asyncHandler(async (req, res) => {
  const {
    name,
    phone,
    telegramChatId,
    telegramId,
    telegramUsername,
    telegramFirstName,
    telegramLastName,
    telegramChat,
    timezone,
    preferences,
    memory,
  } = req.body;

  const update = {};
  if (name !== undefined) update.name = name;
  if (phone !== undefined) update.phone = phone;
  if (telegramChatId !== undefined) update.telegramChatId = telegramChatId;
  if (telegramId !== undefined) update.telegramId = telegramId;
  if (telegramUsername !== undefined) update.telegramUsername = telegramUsername;
  if (telegramFirstName !== undefined) update.telegramFirstName = telegramFirstName;
  if (telegramLastName !== undefined) update.telegramLastName = telegramLastName;
  if (telegramChat !== undefined) update.telegramChat = telegramChat;
  if (timezone !== undefined) update.timezone = timezone;
  if (preferences !== undefined) update.preferences = preferences;
  if (memory !== undefined) update.memory = memory;


  const user = await User.findByIdAndUpdate(req.user._id, update, {
    returnDocument: "after",
    runValidators: true,
  }).select("-password");

  res.json({
    message: "Profile updated successfully",
    user: formatUser(user),
  });
});

module.exports = { getProfile, updateProfile };
