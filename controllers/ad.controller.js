const Ad = require("../models/ads.model");
const { fail, validId, boolean, text, positiveInteger, searchPattern, sendError, uploadImage, cleanup } = require("../utils/helpers");

const parseFields = (body) => {
  const fields = {};
  if (body.title !== undefined) fields.title = text(body.title, "title", { required: true, max: 150 });
  if (body.isActive !== undefined) fields.isActive = boolean(body.isActive, "isActive");
  if (body.videoLink !== undefined) {
    const value = text(body.videoLink, "videoLink", { max: 500 });
    if (value) {
      let parsed;
      try { parsed = new URL(value); } catch { fail("videoLink must be a valid http:// or https:// URL"); }
      if (!["http:", "https:"].includes(parsed.protocol)) fail("videoLink must be a valid http:// or https:// URL");
    }
    fields.videoLink = value;
  }
  return fields;
};

const writeAd = async (req, res, updating) => {
  const uploaded = [];
  let saved = false;
  try {
    const body = req.body || {};
    const fields = parseFields(body);
    const removeImage = body.removeImage !== undefined && boolean(body.removeImage, "removeImage");
    const ad = updating ? await Ad.findById(validId(req.params.id, "ad id")) : new Ad();
    if (!ad) fail("Ad not found", 404);
    ad.set(fields);
    await ad.validate();
    const oldAssets = [];
    if (req.file || removeImage) {
      if (ad.image?.public_id) oldAssets.push({ public_id: ad.image.public_id, url: ad.image.url });
      ad.image = req.file ? await uploadImage(req.file, "samarth/ads", uploaded) : null;
    }
    await ad.save();
    saved = true;
    await cleanup(oldAssets);
    return res.status(updating ? 200 : 201).json({ success: true, message: `Ad ${updating ? "updated" : "created"} successfully`, data: ad });
  } catch (error) {
    if (!saved) await cleanup(uploaded);
    return sendError(res, error, "Ad");
  }
};

const listAds = (admin) => async (req, res) => {
  try {
    const query = req.query || {};
    const filter = admin ? {} : { isActive: true };
    if (admin && query.isActive !== undefined) filter.isActive = boolean(query.isActive, "isActive");
    if (query.search !== undefined) filter.title = searchPattern(query.search);
    const page = positiveInteger(query.page, 1, 100000);
    const limit = positiveInteger(query.limit, 20, 100);
    const [ads, total] = await Promise.all([
      Ad.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Ad.countDocuments(filter),
    ]);
    return res.status(200).json({ success: true, message: "Ads retrieved successfully", data: ads, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { return sendError(res, error, "Ad"); }
};

const findAd = (admin) => async (req, res) => {
  try {
    const filter = { _id: validId(req.params.id, "ad id") };
    if (!admin) filter.isActive = true;
    const ad = await Ad.findOne(filter).lean();
    if (!ad) fail("Ad not found", 404);
    return res.status(200).json({ success: true, data: ad });
  } catch (error) { return sendError(res, error, "Ad"); }
};

const deleteAd = async (req, res) => {
  try {
    const ad = await Ad.findByIdAndDelete(validId(req.params.id, "ad id"));
    if (!ad) fail("Ad not found", 404);
    await cleanup([ad.image]);
    return res.status(200).json({ success: true, message: "Ad deleted successfully" });
  } catch (error) { return sendError(res, error, "Ad"); }
};

module.exports = {
  createAd: (req, res) => writeAd(req, res, false),
  updateAd: (req, res) => writeAd(req, res, true),
  deleteAd,
  getAllAds: listAds(false),
  getAdminAds: listAds(true),
  getAdById: findAd(false),
  getAdminAdById: findAd(true),
};
