const express = require("express");
const { getInfo } = require("../controllers/infoController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.get("/", getInfo);

module.exports = router;
