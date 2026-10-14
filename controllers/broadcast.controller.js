const Broadcast = require("../models/broadcast.model");
const {
  fail, validId, text, positiveInteger, searchPattern, sendError, uploadImage, cleanup,
} = require("../utils/helpers");

const link = (value) => {
  const url = text(value, "link", { max: 500 });
  if (!url) return "";
  let parsed;
  try { parsed = new URL(url); } catch { fail("link must be a valid URL starting with http:// or https://"); }
  if (!["http:", "https:"].includes(parsed.protocol)) fail("link must be a valid URL starting with http:// or https://");
  return url;
};

const parseFields = (body = {}) => {
  const fields = {};
  if (body.title !== undefined) fields.title = text(body.title, "title", { required: true, max: 150 });
  if (body.description !== undefined) fields.description = text(body.description, "description", { required: true, max: 2000 });
  if (body.link !== undefined) fields.link = link(body.link);
  return fields;
};

const writeBroadcast = async (req, res, updating) => {
  const uploaded = [];
  let saved = false;
  try {
    const fields = parseFields(req.body || {});
    let broadcast;
    if (updating) {
      broadcast = await Broadcast.findById(validId(req.params.id, "broadcast id"));
      if (!broadcast) fail("Broadcast not found", 404);
    } else {
      for (const key of ["title", "description"]) {
        if (fields[key] === undefined) fail(`${key} is required`);
      }
      if (!req.file) fail("An image is required");
      broadcast = new Broadcast();
    }
    broadcast.set(fields);
    await broadcast.validate();

    const oldAssets = [];
    if (req.file) {
      // Copy first: broadcast.image is a live nested path that changes on reassignment.
      if (broadcast.image?.public_id) oldAssets.push({ public_id: broadcast.image.public_id, url: broadcast.image.url });
      broadcast.image = await uploadImage(req.file, "samarth/broadcasts", uploaded);
    }
    await broadcast.save();
    saved = true;
    await cleanup(oldAssets);
    return res.status(updating ? 200 : 201).json({ success: true, message: `Broadcast ${updating ? "updated" : "created"} successfully`, data: broadcast });
  } catch (error) {
    if (!saved) await cleanup(uploaded);
    return sendError(res, error, "Broadcast");
  }
};

const listBroadcasts = async (req, res) => {
  try {
    const query = req.query || {};
    const filter = {};
    if (query.search !== undefined) {
      const pattern = searchPattern(query.search);
      filter.$or = [{ title: pattern }, { description: pattern }];
    }
    const page = positiveInteger(query.page, 1, 100000);
    const limit = positiveInteger(query.limit, 20, 100);
    const [broadcasts, total] = await Promise.all([
      Broadcast.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Broadcast.countDocuments(filter),
    ]);
    return res.status(200).json({ success: true, message: "Broadcasts retrieved successfully", data: broadcasts, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { return sendError(res, error, "Broadcast"); }
};

const getBroadcastById = async (req, res) => {
  try {
    const broadcast = await Broadcast.findById(validId(req.params.id, "broadcast id")).lean();
    if (!broadcast) fail("Broadcast not found", 404);
    return res.status(200).json({ success: true, message: "Broadcast retrieved successfully", data: broadcast });
  } catch (error) { return sendError(res, error, "Broadcast"); }
};

const deleteBroadcast = async (req, res) => {
  try {
    const broadcast = await Broadcast.findByIdAndDelete(validId(req.params.id, "broadcast id"));
    if (!broadcast) fail("Broadcast not found", 404);
    await cleanup([broadcast.image]);
    return res.status(200).json({ success: true, message: "Broadcast deleted successfully" });
  } catch (error) { return sendError(res, error, "Broadcast"); }
};

module.exports = {
  createBroadcast: (req, res) => writeBroadcast(req, res, false),
  updateBroadcast: (req, res) => writeBroadcast(req, res, true),
  deleteBroadcast,
  getAllBroadcasts: listBroadcasts,
  getAdminBroadcasts: listBroadcasts,
  getBroadcastById,
};
