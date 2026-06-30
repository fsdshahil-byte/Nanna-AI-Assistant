const express = require("express");
const { chatWithNanna, getChatHistory } = require("../controllers/aiController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.post("/chat", chatWithNanna);
router.get("/history", getChatHistory);

module.exports = router;
