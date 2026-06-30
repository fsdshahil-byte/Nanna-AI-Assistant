const asyncHandler = require("../utils/asyncHandler");
const { fetchLiveInfo } = require("../services/liveInfoService");

const getInfo = asyncHandler(async (req, res) => {
  const topic = req.query.topic || "general";
  const liveInfo = await fetchLiveInfo(topic, { forceRefresh: req.query.refresh === "true" });

  if (!liveInfo) {
    res.json({
      topic,
      reply: "I could not fetch live information for that topic right now.",
      liveInfo: null,
    });
    return;
  }

  res.json({
    topic,
    reply: liveInfo.summary,
    liveInfo,
  });
});

module.exports = { getInfo };
