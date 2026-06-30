const express = require("express");
const multer = require("multer");
const { protect } = require("../middleware/authMiddleware");
const { uploadFile } = require("../controllers/uploadController");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads"),
  filename: (req, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    cb(null, safeName);
  },
});

const upload = multer({ storage });
const router = express.Router();

router.use(protect);
router.post("/", upload.single("file"), uploadFile);

module.exports = router;
