const LiveInfo = require("../models/LiveInfo");

const LIVE_INFO_MAX_AGE_MS = Number(
  process.env.LIVE_INFO_MAX_AGE_MS || 300000
);

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

const cleanTopic = (topic = "") =>
  String(topic)
    .replace(
      /\b(?:search|look up|tell me about|what is|who is|where is|when is|latest|today'?s)\b/gi,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();

const toLiveInfoPayload = (doc) =>
  doc
    ? {
        query: doc.query,
        source: doc.source,
        url: doc.url,
        checkedAt:
          doc.checkedAt instanceof Date
            ? doc.checkedAt.toISOString()
            : doc.checkedAt,
        summary: doc.summary,
        stale: Boolean(doc.stale),
      }
    : null;

const fetchTavilyInfo = async (query) => {
  if (!TAVILY_API_KEY) {
    console.log("TAVILY_API_KEY missing");
    return null;
  }

  try {
    const response = await fetch(
      "https://api.tavily.com/search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: TAVILY_API_KEY,
          query,
          search_depth: "advanced",
          include_answer: true,
          max_results: 5,
        }),
      }
    );

    if (!response.ok) {
      console.error(
        "Tavily Error:",
        response.status
      );
      return null;
    }

    const data = await response.json();

    const answer = data.answer || "";

    const sources = (data.results || [])
      .slice(0, 5)
      .map(
        (item) =>
          `${item.title}: ${item.content}`
      )
      .join("\n\n");

    return {
      query,
      source: "Tavily Search",
      url: data.results?.[0]?.url || "",
      checkedAt: new Date(),
      summary: `${answer}\n\n${sources}`,
      stale: false,
    };
  } catch (error) {
    console.error(
      "Tavily request failed:",
      error.message
    );
    return null;
  }
};

const fetchLiveInfo = async (
  topic,
  { forceRefresh = false } = {}
) => {
  const query = cleanTopic(topic);

  if (!query) return null;

  try {
    const cached = await LiveInfo.findOne({
      query,
    });

    const cachedAge = cached
      ? Date.now() -
        new Date(cached.checkedAt).getTime()
      : Infinity;

    if (
      cached &&
      !forceRefresh &&
      cachedAge <= LIVE_INFO_MAX_AGE_MS
    ) {
      return toLiveInfoPayload(cached);
    }

    const freshInfo =
      await fetchTavilyInfo(query);

    if (!freshInfo) {
      return cached
        ? toLiveInfoPayload({
            ...cached.toObject(),
            stale: true,
          })
        : null;
    }

    const saved =
      await LiveInfo.findOneAndUpdate(
        { query },
        { $set: freshInfo },
        {
          upsert: true,
          returnDocument: "after",
          setDefaultsOnInsert: true,
        }
      );

    return toLiveInfoPayload(saved);
  } catch (error) {
    console.error(
      "Live info lookup failed:",
      error.message
    );

    const cached = await LiveInfo.findOne({
      query,
    }).catch(() => null);

    return cached
      ? toLiveInfoPayload({
          ...cached.toObject(),
          stale: true,
        })
      : null;
  }
};

module.exports = {
  fetchLiveInfo,
  cleanTopic,
};
