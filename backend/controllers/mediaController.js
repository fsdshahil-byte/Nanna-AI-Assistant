const AutomationJob = require("../models/AutomationJob");
const asyncHandler = require("../utils/asyncHandler");

const mediaCommand = asyncHandler(async (req, res) => {
  const { command, query, volume } = req.body;
  const job = await AutomationJob.create({
    user: req.user._id,
    type: "custom",
    payload: { module: "media", command, query, volume },
    status: "completed",
    result: {
      status: "simulated",
      message: "Connect Spotify/YouTube credentials to execute real playback.",
    },
  });

  res.json({
    reply: `Media command received: ${command}${query ? ` ${query}` : ""}.`,
    job,
  });
});

module.exports = { mediaCommand };
