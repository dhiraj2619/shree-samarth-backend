const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;

const fail = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

const validId = (value, field) => {
  if (typeof value !== "string" || !mongoose.isObjectIdOrHexString(value)) {
    fail(`Invalid ${field}`);
  }
  return value;
};

const boolean = (value, field) => {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return fail(`${field} must be true or false`);
};

const text = (value, field, { required = false, max = 5000 } = {}) => {
  if (typeof value !== "string") fail(`${field} must be a string`);
  const trimmed = value.trim();
  if (required && !trimmed) fail(`${field} must be a non-empty string`);
  if (trimmed.length > max) fail(`${field} must be at most ${max} characters`);
  return trimmed;
};

// Accepts real arrays (JSON bodies) or JSON strings (multipart bodies).
const array = (value, field) => {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { fail(`${field} must be a JSON array`); }
  }
  if (!Array.isArray(value)) fail(`${field} must be an array`);
  return value;
};

const object = (value, field) => {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { fail(`${field} must be valid JSON`); }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${field} must be an object`);
  return value;
};

const positiveInteger = (value, fallback, max) => {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > max) {
    fail(`Pagination must use positive integers (maximum ${max})`);
  }
  return Number(value);
};

const searchPattern = (value) => {
  if (typeof value !== "string" || value.length > 200) fail("search must be a string of at most 200 characters");
  return { $regex: value.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
};

const sendError = (res, error, label) => {
  const status = error.status || (["ValidationError", "CastError"].includes(error.name) ? 400 : error.code === 11000 ? 409 : 500);
  if (status === 500) console.error(`${label} operation failed:`, error.message);
  return res.status(status).json({ success: false, message: status === 500 ? `Unable to complete ${label.toLowerCase()} operation` : error.message });
};

const uploadImage = async (file, folder, uploaded) => {
  const result = await cloudinary.uploader.upload(`data:${file.mimetype};base64,${file.buffer.toString("base64")}`, { folder });
  const asset = { public_id: result.public_id, url: result.secure_url };
  uploaded.push(asset);
  return asset;
};

// Only delete assets uploaded into Samarth's own Cloudinary namespace.
const cleanup = async (assets) => {
  await Promise.all(assets.filter((asset) => asset?.public_id?.startsWith("samarth/")).map(async (asset) => {
    try { await cloudinary.uploader.destroy(asset.public_id); }
    catch (error) { console.error("Image cleanup failed:", error.message); }
  }));
};

module.exports = { fail, validId, boolean, text, array, object, positiveInteger, searchPattern, sendError, uploadImage, cleanup };
