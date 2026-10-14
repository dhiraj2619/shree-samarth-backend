const multer = require("multer");

const IMAGE_TYPES = { "image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WebP", "image/gif": "GIF" };

const listTypes = (names) => (names.length > 1 ? `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}` : names[0]);

// Memory-storage uploader limited to the given image MIME types (5 MB per file).
const imageUpload = (types) => multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 11, fields: 40 },
  fileFilter(req, file, callback) {
    if (!types.includes(file.mimetype)) {
      const error = new Error(`Only ${listTypes(types.map((type) => IMAGE_TYPES[type]))} images are supported`);
      error.status = 400;
      return callback(error);
    }
    callback(null, true);
  },
});

module.exports = imageUpload(["image/jpeg", "image/png", "image/webp"]);
// Broadcasts also accept GIFs (Cloudinary keeps them animated).
module.exports.withGif = imageUpload(["image/jpeg", "image/png", "image/webp", "image/gif"]);
