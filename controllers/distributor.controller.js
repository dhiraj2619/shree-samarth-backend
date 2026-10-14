const Distributor = require("../models/distributor.model");
const {
  fail, validId, boolean, text, positiveInteger, searchPattern, sendError, uploadImage, cleanup,
} = require("../utils/helpers");

// Accepts "98765 43210", "+91 98765-43210" or "098765..." and stores the 10 digits.
const mobile = (value) => {
  const digits = text(value, "mobile", { required: true, max: 20 }).replace(/[\s()-]/g, "").replace(/^(\+?91|0)(?=\d{10}$)/, "");
  if (!/^[6-9]\d{9}$/.test(digits)) fail("mobile must be a valid 10-digit Indian mobile number");
  return digits;
};

// Adds https:// when the scheme is missing, so "samarth.in" is accepted.
const website = (value) => {
  let url = text(value, "website", { max: 300 });
  if (!url) return "";
  if (!/^[a-z][a-z\d+.-]*:/i.test(url)) url = `https://${url}`;
  let parsed;
  try { parsed = new URL(url); } catch { fail("website must be a valid web address"); }
  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname.includes(".")) fail("website must be a valid web address");
  return url;
};

const parseFields = (body = {}) => {
  const fields = {};
  if (body.companyName !== undefined) fields.companyName = text(body.companyName, "companyName", { required: true, max: 150 });
  if (body.contactPerson !== undefined) fields.contactPerson = text(body.contactPerson, "contactPerson", { required: true, max: 100 });
  if (body.mobile !== undefined) fields.mobile = mobile(body.mobile);
  if (body.website !== undefined) fields.website = website(body.website);
  if (body.pincode !== undefined) {
    const pincode = text(body.pincode, "pincode", { required: true, max: 6 });
    if (!/^[1-9]\d{5}$/.test(pincode)) fail("pincode must be 6 digits");
    fields.pincode = pincode;
  }
  if (body.city !== undefined) fields.city = text(body.city, "city", { required: true, max: 100 });
  if (body.state !== undefined) fields.state = text(body.state, "state", { required: true, max: 100 });
  return fields;
};

const REQUIRED = ["companyName", "contactPerson", "mobile", "pincode", "city", "state"];

const writeDistributor = async (req, res, updating) => {
  const uploaded = [];
  let saved = false;
  try {
    const body = req.body || {};
    const fields = parseFields(body);
    let distributor;
    if (updating) {
      distributor = await Distributor.findById(validId(req.params.id, "distributor id"));
      if (!distributor) fail("Distributor not found", 404);
    } else {
      for (const key of REQUIRED) {
        if (fields[key] === undefined) fail(`${key} is required`);
      }
      distributor = new Distributor();
    }
    distributor.set(fields);
    await distributor.validate();

    const oldAssets = [];
    const removeLogo = body.removeLogo !== undefined && boolean(body.removeLogo, "removeLogo");
    // Copy first: distributor.logo is a live nested path that changes on reassignment.
    const previous = distributor.logo?.public_id ? { public_id: distributor.logo.public_id, url: distributor.logo.url } : null;
    if (req.file) {
      oldAssets.push(previous);
      distributor.logo = await uploadImage(req.file, "samarth/distributors", uploaded);
    } else if (removeLogo) {
      oldAssets.push(previous);
      distributor.logo = undefined;
    }
    await distributor.save();
    saved = true;
    await cleanup(oldAssets);
    return res.status(updating ? 200 : 201).json({ success: true, message: `Distributor ${updating ? "updated" : "created"} successfully`, data: distributor });
  } catch (error) {
    if (!saved) await cleanup(uploaded);
    return sendError(res, error, "Distributor");
  }
};

const listDistributors = async (req, res) => {
  try {
    const query = req.query || {};
    const filter = {};
    if (query.search !== undefined) {
      const pattern = searchPattern(query.search);
      filter.$or = ["companyName", "contactPerson", "mobile", "city", "state", "pincode"].map((key) => ({ [key]: pattern }));
    }
    const page = positiveInteger(query.page, 1, 100000);
    const limit = positiveInteger(query.limit, 20, 100);
    const [distributors, total] = await Promise.all([
      Distributor.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Distributor.countDocuments(filter),
    ]);
    return res.status(200).json({ success: true, message: "Distributors retrieved successfully", data: distributors, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { return sendError(res, error, "Distributor"); }
};

const getDistributorById = async (req, res) => {
  try {
    const distributor = await Distributor.findById(validId(req.params.id, "distributor id")).lean();
    if (!distributor) fail("Distributor not found", 404);
    return res.status(200).json({ success: true, message: "Distributor retrieved successfully", data: distributor });
  } catch (error) { return sendError(res, error, "Distributor"); }
};

const deleteDistributor = async (req, res) => {
  try {
    const distributor = await Distributor.findByIdAndDelete(validId(req.params.id, "distributor id"));
    if (!distributor) fail("Distributor not found", 404);
    await cleanup([distributor.logo]);
    return res.status(200).json({ success: true, message: "Distributor deleted successfully" });
  } catch (error) { return sendError(res, error, "Distributor"); }
};

module.exports = {
  createDistributor: (req, res) => writeDistributor(req, res, false),
  updateDistributor: (req, res) => writeDistributor(req, res, true),
  deleteDistributor,
  getAllDistributors: listDistributors,
  getAdminDistributors: listDistributors,
  getDistributorById,
};
