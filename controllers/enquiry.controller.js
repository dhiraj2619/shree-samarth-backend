const Lead = require("../models/lead.model");
const Product = require("../models/products.model");
const {
  fail, validId, text, positiveInteger, searchPattern, sendError,
} = require("../utils/helpers");

const STATUSES = ["NEW", "CONTACTED", "CLOSED"];
const TYPES = ["PRODUCT_ENQUIRY", "GENERAL_ENQUIRY", "WHATSAPP_LEAD"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Simple per-IP limit so the public contact form cannot be used to flood the inbox.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const submissions = new Map();
const rateLimited = (key, now = Date.now()) => {
  const recent = (submissions.get(key) || []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) { submissions.set(key, recent); return true; }
  recent.push(now);
  submissions.set(key, recent);
  return false;
};

// Accepts "98765 43210", "+91 98765-43210" or "098765..." and stores the 10 digits.
const phone = (value) => {
  const digits = text(value, "phone", { required: true, max: 20 }).replace(/[\s()-]/g, "").replace(/^(\+?91|0)(?=\d{10}$)/, "");
  if (!/^[6-9]\d{9}$/.test(digits)) fail("phone must be a valid 10-digit mobile number");
  return digits;
};

// Public: the website's Contact us form. Accepts friendly names (name, phone, message)
// as well as the model's own (customerName, contact, enquiry).
const submitEnquiry = async (req, res) => {
  try {
    const body = req.body || {};
    if (typeof body.website === "string" && body.website.trim()) {
      // Honeypot field: real visitors never fill it, bots usually do. Pretend it worked.
      return res.status(201).json({ success: true, message: "Thank you! We will get back to you soon." });
    }
    const fields = {
      customerName: text(body.name ?? body.customerName ?? "", "name", { required: true, max: 100 }),
      contact: phone(body.phone ?? body.contact ?? ""),
      email: text(body.email ?? "", "email", { max: 150 }).toLowerCase(),
      enquiry: text(body.message ?? body.enquiry ?? "", "message", { required: true, max: 2000 }),
      leadType: "GENERAL_ENQUIRY",
      source: "web",
    };
    if (fields.email && !EMAIL.test(fields.email)) fail("email must be a valid email address");
    if (body.productId !== undefined && body.productId !== "") {
      const product = await Product.exists({ _id: validId(body.productId, "productId") });
      if (!product) fail("Product not found", 404);
      fields.product = body.productId;
      fields.leadType = "PRODUCT_ENQUIRY";
    }
    if (rateLimited(req.ip || "unknown")) fail("Too many enquiries from this device. Please try again in a few minutes.", 429);
    const lead = await Lead.create(fields);
    return res.status(201).json({ success: true, message: "Thank you! We will get back to you soon.", data: { _id: lead._id } });
  } catch (error) { return sendError(res, error, "Enquiry"); }
};

const listEnquiries = async (req, res) => {
  try {
    const query = req.query || {};
    const filter = {};
    if (query.status !== undefined) {
      if (!STATUSES.includes(query.status)) fail(`status must be one of ${STATUSES.join(", ")}`);
      filter.status = query.status;
    }
    if (query.leadType !== undefined) {
      if (!TYPES.includes(query.leadType)) fail(`leadType must be one of ${TYPES.join(", ")}`);
      filter.leadType = query.leadType;
    }
    if (query.search !== undefined) {
      const pattern = searchPattern(query.search);
      filter.$or = [{ customerName: pattern }, { contact: pattern }, { email: pattern }, { enquiry: pattern }];
    }
    const page = positiveInteger(query.page, 1, 100000);
    const limit = positiveInteger(query.limit, 20, 100);
    const [enquiries, total] = await Promise.all([
      Lead.find(filter).populate("product", "name").sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Lead.countDocuments(filter),
    ]);
    return res.status(200).json({ success: true, message: "Enquiries retrieved successfully", data: enquiries, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { return sendError(res, error, "Enquiry"); }
};

const updateEnquiry = async (req, res) => {
  try {
    const status = req.body?.status;
    if (!STATUSES.includes(status)) fail(`status must be one of ${STATUSES.join(", ")}`);
    const lead = await Lead.findByIdAndUpdate(validId(req.params.id, "enquiry id"), { status }, { returnDocument: "after", runValidators: true }).populate("product", "name");
    if (!lead) fail("Enquiry not found", 404);
    return res.status(200).json({ success: true, message: "Enquiry updated successfully", data: lead });
  } catch (error) { return sendError(res, error, "Enquiry"); }
};

const deleteEnquiry = async (req, res) => {
  try {
    const lead = await Lead.findByIdAndDelete(validId(req.params.id, "enquiry id"));
    if (!lead) fail("Enquiry not found", 404);
    return res.status(200).json({ success: true, message: "Enquiry deleted successfully" });
  } catch (error) { return sendError(res, error, "Enquiry"); }
};

const resetRateLimits = () => submissions.clear();

module.exports = { submitEnquiry, listEnquiries, updateEnquiry, deleteEnquiry, resetRateLimits };
