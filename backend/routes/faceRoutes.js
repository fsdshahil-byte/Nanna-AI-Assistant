const express = require("express");
const router  = express.Router();
const fs      = require("fs");
const path    = require("path");
const multer  = require("multer");

// ── face-api (server-side) ─────────────────────────────────
const faceapi = require("face-api.js");
const { Canvas, Image, ImageData } = require("canvas");
const { loadImage } = require("canvas");
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

// ── Controllers ────────────────────────────────────────────
const {
  registerFace,
  recognizeFace,
  listFaces,
  getFace,
  updateFace,
  removeFace,
  resetFaces,
} = require("../controllers/faceController");

// ── Config ─────────────────────────────────────────────────
const FACES_DIR = process.env.FACES_DIR
  || path.join(__dirname, "..", "..", "frontend", "public", "faces");

const MODELS_DIR = process.env.MODELS_DIR
  || path.join(__dirname, "..", "..", "frontend", "public", "models");

// ── Load face-api models once on startup ───────────────────
let modelsLoaded = false;
const loadModels = async () => {
  if (modelsLoaded) return;
  await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS_DIR);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_DIR);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_DIR);
  modelsLoaded = true;
  console.log("[face-api] Server models loaded from", MODELS_DIR);
};
loadModels().catch(console.error);

// ── Multer — memory storage ────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (/image\/(jpeg|png|webp)/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG, or WebP images are allowed."));
  },
});

// ── Manifest helper ────────────────────────────────────────
function buildManifest(facesDir) {
  const entries = [];
  for (const folder of fs.readdirSync(facesDir)) {
    const folderPath = path.join(facesDir, folder);
    try {
      if (!fs.statSync(folderPath).isDirectory()) continue;
    } catch {
      continue; // skip if file disappeared between reads
    }
    const [rawName, rawRel = "Other"] = folder.split("__");
    const name         = rawName.replace(/_/g, " ").trim();
    const relationship = rawRel.replace(/_/g, " ").trim();
    for (const file of fs.readdirSync(folderPath)) {
      if (!/\.(jpe?g|png|webp)$/i.test(file)) continue;
      entries.push({ file: `faces/${folder}/${file}`, name, relationship });
    }
  }
  return entries;
}

// ─────────────────────────────────────────────────────────────
// NAMED ROUTES — must come before /:id param routes
// ─────────────────────────────────────────────────────────────

// POST /api/face/register — descriptor array from browser
router.post("/register", registerFace);

// POST /api/face/upload — image file from Postman or form
// Body: multipart/form-data { name, relationship, image }
router.post("/upload", upload.single("image"), async (req, res) => {
  try {
    await loadModels();

    const name         = String(req.body.name         || "").trim();
    const relationship = String(req.body.relationship || "Other").trim();

    if (!name)     return res.status(400).json({ success: false, error: "name is required." });
    if (!req.file) return res.status(400).json({ success: false, error: "image file is required." });

    // Load image buffer into canvas
    const img = await loadImage(req.file.buffer);

    // Detect face + extract 128-float descriptor
    const detection = await faceapi
      .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      return res.status(422).json({
        success: false,
        error: "No face detected. Try a clearer, well-lit photo.",
      });
    }

    const descriptor = Array.from(detection.descriptor);

    // Reuse existing registerFace logic via direct model call
    const Face = require("../models/FaceProfile");

    const existing = await Face.findOne({ name });
    if (existing) {
      return res.status(409).json({ success: false, error: `"${name}" is already registered.` });
    }

    const face = await Face.create({
      name,
      relationship,
      descriptor,
      createdAt: new Date(),
    });

    res.status(201).json({
      success: true,
      member: {
        _id:          face._id,
        name:         face.name,
        relationship: face.relationship,
        createdAt:    face.createdAt,
      },
    });

  } catch (err) {
    console.error("[faceUpload]", err);
    res.status(500).json({ success: false, error: err.message || "Server error during upload." });
  }
});

// POST /api/face/recognize — descriptor array from browser
router.post("/recognize", recognizeFace);

// GET /api/face/list — all registered faces
router.get("/list", listFaces);

// DELETE /api/face/reset — clear all faces (keep above /:id)
router.delete("/reset", resetFaces);

// GET /api/face/manifest — list images in public/faces/
router.get("/manifest", (req, res) => {
  console.log("[manifest] Looking for faces at:", FACES_DIR);
  console.log("[manifest] Exists:", fs.existsSync(FACES_DIR));

  if (!fs.existsSync(FACES_DIR)) return res.json([]);

  try {
    res.json(buildManifest(FACES_DIR));
  } catch (err) {
    console.error("[manifest]", err);
    res.status(500).json({ error: "Could not read public/faces directory." });
  }
});

// ─────────────────────────────────────────────────────────────
// PARAM ROUTES — must come last
// ─────────────────────────────────────────────────────────────

router.get   ("/:id", getFace);
router.put   ("/:id", updateFace);
router.delete("/:id", removeFace);

module.exports = router;