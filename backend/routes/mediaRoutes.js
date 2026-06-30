const express = require("express");
const { mediaCommand } = require("../controllers/mediaController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.post("/command", mediaCommand);

module.exports = router;
