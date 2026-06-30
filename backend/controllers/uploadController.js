const path = require("path");
const fs = require("fs");
const asyncHandler = require("../utils/asyncHandler");

const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error("No file uploaded");
  }

  // Use PUBLIC_URL from env for Twilio compatibility, or construct from request
  const publicUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
  const fileUrl = `${publicUrl}/uploads/${req.file.filename}`;

  res.status(201).json({
    file: {
      name: req.file.originalname,
      type: req.file.mimetype,
      url: fileUrl,
      size: req.file.size,
      storedPath: path.join(__dirname, "..", "uploads", req.file.filename),
    },
  });
});

const ensureUploadFolder = () => {
  const uploadsDir = path.join(__dirname, "..", "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
};

module.exports = { uploadFile, ensureUploadFolder };