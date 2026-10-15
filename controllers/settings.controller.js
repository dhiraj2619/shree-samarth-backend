const AdminInfo = require("../models/adminInfo.model");
const QuoteSlider = require("../models/quoteslider.model");
const {
  fail, validId, text, sendError, uploadImage, cleanup,
} = require("../utils/helpers");

const MAX_SLIDES = 10;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;

// Accepts "98765 43210", "+91 98765-43210" or "098765..." and returns the 10 digits.
const mobileDigits = (value) => value.replace(/[\s()-]/g, "").replace(/^(\+?91|0)(?=\d{10}$)/, "");

const optionalMobile = (value, field) => {
  const raw = text(value, field, { max: 20 });
  if (!raw) return "";
  const digits = mobileDigits(raw);
  if (!/^[6-9]\d{9}$/.test(digits)) fail(`${field} must be a valid 10-digit mobile number`);
  return digits;
};

// Adds https:// when missing. `hosts` limits which sites are accepted for a social link.
const link = (value, field, hosts) => {
  let url = text(value, field, { max: 300 });
  if (!url) return "";
  if (!/^[a-z][a-z\d+.-]*:/i.test(url)) url = `https://${url}`;
  let parsed;
  try { parsed = new URL(url); } catch { fail(`${field} must be a valid link`); }
  if (!["http:", "https:"].includes(parsed.protocol)) fail(`${field} must be a valid link`);
  const host = parsed.hostname.replace(/^www\./, "");
  if (hosts && !hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) fail(`${field} must be a ${hosts[0]} link`);
  return url;
};

// A WhatsApp mobile number becomes a wa.me link; an existing WhatsApp link is kept.
const whatsapp = (value) => {
  const raw = text(value, "whatsapp", { max: 300 });
  if (!raw) return "";
  const digits = mobileDigits(raw);
  if (/^\d+$/.test(digits)) {
    if (!/^[6-9]\d{9}$/.test(digits)) fail("whatsapp must be a 10-digit mobile number or a WhatsApp link");
    return `https://wa.me/91${digits}`;
  }
  return link(raw, "whatsapp", ["wa.me", "whatsapp.com"]);
};

const parseProfile = (body = {}) => {
  const fields = {};
  if (body.companyName !== undefined) fields.companyName = text(body.companyName, "companyName", { required: true, max: 150 });
  if (body.ownerName !== undefined) fields.ownerName = text(body.ownerName, "ownerName", { required: true, max: 100 });
  if (body.phone !== undefined) fields.phone = optionalMobile(body.phone, "phone");
  if (body.email !== undefined) {
    const email = text(body.email, "email", { max: 150 }).toLowerCase();
    if (email && !EMAIL.test(email)) fail("email must be a valid email address");
    fields.email = email;
  }
  if (body.address !== undefined) fields.address = text(body.address, "address", { max: 500 });
  if (body.gstNumber !== undefined) {
    const gst = text(body.gstNumber, "gstNumber", { max: 15 }).toUpperCase();
    if (gst && !GSTIN.test(gst)) fail("gstNumber must be a valid 15-character GSTIN");
    fields.gstNumber = gst;
  }
  const social = body.socialLinks === undefined ? {} : body.socialLinks;
  if (!social || typeof social !== "object" || Array.isArray(social)) fail("socialLinks must be an object");
  if (social.instagram !== undefined) fields["socialLinks.instagram"] = link(social.instagram, "instagram", ["instagram.com"]);
  if (social.youtube !== undefined) fields["socialLinks.youtube"] = link(social.youtube, "youtube", ["youtube.com", "youtu.be"]);
  if (social.whatsapp !== undefined) fields["socialLinks.whatsapp"] = whatsapp(social.whatsapp);
  return fields;
};

// The profile is a single document; it is created with defaults the first time it is needed.
const loadProfile = async () => (await AdminInfo.findOne()) || new AdminInfo();

const listSlides = () => QuoteSlider.find().sort({ createdAt: 1, _id: 1 }).lean();

const publicProfile = (profile) => {
  const { companyName, ownerName, email, phone, address, gstNumber, socialLinks, updatedAt } = profile.toObject ? profile.toObject() : profile;
  return { companyName, ownerName, email, phone, address, gstNumber, socialLinks, updatedAt };
};

// Public: everything the website/app needs in one call.
const getSettings = async (req, res) => {
  try {
    const [profile, quoteSlides] = await Promise.all([loadProfile(), listSlides()]);
    return res.status(200).json({ success: true, message: "Settings retrieved successfully", data: { profile: publicProfile(profile), quoteSlides } });
  } catch (error) { return sendError(res, error, "Settings"); }
};

const updateProfile = async (req, res) => {
  try {
    const fields = parseProfile(req.body || {});
    const profile = await loadProfile();
    profile.set(fields);
    await profile.save();
    return res.status(200).json({ success: true, message: "Profile updated successfully", data: publicProfile(profile) });
  } catch (error) { return sendError(res, error, "Settings"); }
};

const getQuoteSlides = async (req, res) => {
  try {
    return res.status(200).json({ success: true, message: "Quote slides retrieved successfully", data: await listSlides() });
  } catch (error) { return sendError(res, error, "Quote slide"); }
};

const addQuoteSlide = async (req, res) => {
  const uploaded = [];
  try {
    if (!req.file) fail("An image is required");
    if (await QuoteSlider.countDocuments() >= MAX_SLIDES) fail(`You can have at most ${MAX_SLIDES} quote slides. Delete one first.`);
    const image = await uploadImage(req.file, "samarth/quote-slides", uploaded);
    const slide = await QuoteSlider.create({ image });
    return res.status(201).json({ success: true, message: "Quote slide added successfully", data: slide });
  } catch (error) {
    await cleanup(uploaded);
    return sendError(res, error, "Quote slide");
  }
};

// Replaces a slide's image in place, keeping its position.
const updateQuoteSlide = async (req, res) => {
  const uploaded = [];
  let saved = false;
  try {
    const slide = await QuoteSlider.findById(validId(req.params.id, "slide id"));
    if (!slide) fail("Quote slide not found", 404);
    if (!req.file) fail("An image is required");
    const previous = { public_id: slide.image.public_id, url: slide.image.url };
    slide.image = await uploadImage(req.file, "samarth/quote-slides", uploaded);
    await slide.save();
    saved = true;
    await cleanup([previous]);
    return res.status(200).json({ success: true, message: "Quote slide updated successfully", data: slide });
  } catch (error) {
    if (!saved) await cleanup(uploaded);
    return sendError(res, error, "Quote slide");
  }
};

const deleteQuoteSlide = async (req, res) => {
  try {
    const slide = await QuoteSlider.findByIdAndDelete(validId(req.params.id, "slide id"));
    if (!slide) fail("Quote slide not found", 404);
    await cleanup([slide.image]);
    return res.status(200).json({ success: true, message: "Quote slide deleted successfully" });
  } catch (error) { return sendError(res, error, "Quote slide"); }
};

module.exports = { getSettings, updateProfile, getQuoteSlides, addQuoteSlide, updateQuoteSlide, deleteQuoteSlide };
