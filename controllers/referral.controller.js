const Referral = require("../models/referral.model");
const Product = require("../models/products.model");
const { fail, validId, text, positiveInteger, searchPattern, sendError } = require("../utils/helpers");

const NOHAR_HOME = "https://nohar.in";
const TIMEZONE = "Asia/Kolkata";
const TYPES = ["buy", "bulk"];
const STATUSES = ["REDIRECTED", "CONVERTED", "NOT_CONVERTED"];

const parseType = (value) => {
  if (!TYPES.includes(value)) fail("type must be \"buy\" or \"bulk\"");
  return value;
};

const parseQuantity = (value, type) => {
  if (type !== "bulk" || value === undefined || value === "") return 1;
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) fail("quantity must be a whole number of at least 1");
  return quantity;
};

const redirectFor = (product, type) => (type === "bulk" ? product.bulkPurchaseUrl : product.buyNowUrl) || NOHAR_HOME;

const recordClick = async (productId, type, quantity) => {
  const product = await Product.findOne({ _id: validId(productId, "productId"), isActive: true }).select("name buyNowUrl bulkPurchaseUrl");
  if (!product) fail("Product not found", 404);
  const redirectUrl = redirectFor(product, type);
  await Referral.create({ product: product._id, productName: product.name, type, quantity, redirectUrl, source: "web" });
  return redirectUrl;
};

// Public: the catalogue site calls this from a button click, then sends the visitor on.
const trackReferral = async (req, res) => {
  try {
    const body = req.body || {};
    const type = parseType(body.type);
    const redirectUrl = await recordClick(body.productId, type, parseQuantity(body.quantity, type));
    return res.status(201).json({ success: true, message: "Referral recorded", data: { redirectUrl } });
  } catch (error) { return sendError(res, error, "Referral"); }
};

// Public: a plain link (/go/:productId?type=buy) that records the click and redirects.
// Works without JavaScript. If recording fails the visitor still reaches Nohar.
const goToNohar = async (req, res) => {
  let destination = NOHAR_HOME;
  try {
    const type = parseType(req.query?.type || "buy");
    destination = await recordClick(req.params.productId, type, parseQuantity(req.query?.quantity, type));
  } catch (error) {
    if (!error.status) console.error("Referral redirect failed:", error.message);
  }
  return res.redirect(302, destination);
};

const parseOutcome = (body, referral) => {
  const fields = {};
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) fail(`status must be one of ${STATUSES.join(", ")}`);
    fields.status = body.status;
  }
  const status = fields.status || referral?.status || "REDIRECTED";
  if (status === "CONVERTED") {
    const value = body.orderValue !== undefined ? Number(body.orderValue) : referral?.orderValue;
    if (body.orderValue !== undefined && (String(body.orderValue).trim() === "" || !Number.isFinite(value) || value <= 0)) fail("orderValue must be a positive number");
    if (!(value > 0)) fail("orderValue is required when status is CONVERTED");
    fields.orderValue = value;
    if (body.noharOrderId !== undefined) fields.noharOrderId = text(body.noharOrderId, "noharOrderId", { max: 100 });
  } else {
    fields.orderValue = null;
    fields.noharOrderId = "";
  }
  return fields;
};

// Admin: log a redirect by hand (e.g. a phone enquiry that was sent to Nohar).
const createReferral = async (req, res) => {
  try {
    const body = req.body || {};
    const product = await Product.findById(validId(body.productId, "productId")).select("name buyNowUrl bulkPurchaseUrl");
    if (!product) fail("Product not found", 404);
    const type = parseType(body.type);
    let redirectedAt = new Date();
    if (body.redirectedAt !== undefined) {
      redirectedAt = new Date(body.redirectedAt);
      if (Number.isNaN(redirectedAt.getTime()) || redirectedAt > new Date(Date.now() + 60000)) fail("redirectedAt must be a valid date that is not in the future");
    }
    const referral = await Referral.create({
      product: product._id, productName: product.name, type, quantity: parseQuantity(body.quantity, type),
      redirectUrl: redirectFor(product, type), redirectedAt, source: "admin", ...parseOutcome(body, null),
    });
    return res.status(201).json({ success: true, message: "Referral created successfully", data: referral });
  } catch (error) { return sendError(res, error, "Referral"); }
};

// Admin: record what happened on Nohar.
const updateReferral = async (req, res) => {
  try {
    const referral = await Referral.findById(validId(req.params.id, "referral id"));
    if (!referral) fail("Referral not found", 404);
    referral.set(parseOutcome(req.body || {}, referral));
    await referral.save();
    return res.status(200).json({ success: true, message: "Referral updated successfully", data: referral });
  } catch (error) { return sendError(res, error, "Referral"); }
};

const deleteReferral = async (req, res) => {
  try {
    const referral = await Referral.findByIdAndDelete(validId(req.params.id, "referral id"));
    if (!referral) fail("Referral not found", 404);
    return res.status(200).json({ success: true, message: "Referral deleted successfully" });
  } catch (error) { return sendError(res, error, "Referral"); }
};

const listReferrals = async (req, res) => {
  try {
    const query = req.query || {};
    const filter = {};
    if (query.type !== undefined) filter.type = parseType(query.type);
    if (query.status !== undefined) {
      if (!STATUSES.includes(query.status)) fail(`status must be one of ${STATUSES.join(", ")}`);
      filter.status = query.status;
    }
    if (query.productId !== undefined) filter.product = validId(query.productId, "productId");
    if (query.search !== undefined) {
      const pattern = searchPattern(query.search);
      filter.$or = [{ productName: pattern }, { noharOrderId: pattern }];
    }
    const page = positiveInteger(query.page, 1, 100000);
    const limit = positiveInteger(query.limit, 20, 100);
    const [referrals, total] = await Promise.all([
      Referral.find(filter).sort({ redirectedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
      Referral.countDocuments(filter),
    ]);
    return res.status(200).json({ success: true, message: "Referrals retrieved successfully", data: referrals, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { return sendError(res, error, "Referral"); }
};

const dayKey = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

// Admin: everything the dashboard needs in one request.
const getSummary = async (req, res) => {
  try {
    const days = positiveInteger(req.query?.days, 14, 90);
    const since = new Date(Date.now() - days * 864e5);
    const revenue = { $cond: [{ $eq: ["$status", "CONVERTED"] }, { $ifNull: ["$orderValue", 0] }, 0] };
    const converted = { $cond: [{ $eq: ["$status", "CONVERTED"] }, 1, 0] };
    const [result] = await Referral.aggregate([
      {
        $facet: {
          byType: [{ $group: { _id: "$type", count: { $sum: 1 }, converted: { $sum: converted }, revenue: { $sum: revenue }, units: { $sum: "$quantity" } } }],
          byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          daily: [
            { $match: { redirectedAt: { $gte: since } } },
            { $group: { _id: { day: { $dateToString: { format: "%Y-%m-%d", date: "$redirectedAt", timezone: TIMEZONE } }, type: "$type" }, count: { $sum: 1 } } },
          ],
          topProducts: [
            { $group: { _id: "$product", name: { $last: "$productName" }, total: { $sum: 1 }, buy: { $sum: { $cond: [{ $eq: ["$type", "buy"] }, 1, 0] } }, revenue: { $sum: revenue } } },
            { $sort: { total: -1, revenue: -1 } },
            { $limit: 5 },
          ],
        },
      },
    ]);

    const byType = Object.fromEntries(TYPES.map((type) => {
      const row = result.byType.find((r) => r._id === type);
      return [type, { count: row?.count || 0, converted: row?.converted || 0, revenue: row?.revenue || 0, units: row?.units || 0 }];
    }));
    const byStatus = Object.fromEntries(STATUSES.map((status) => [status, result.byStatus.find((r) => r._id === status)?.count || 0]));
    const daily = Array.from({ length: days }, (_, i) => {
      const key = dayKey(new Date(Date.now() - (days - 1 - i) * 864e5));
      const count = (type) => result.daily.find((r) => r._id.day === key && r._id.type === type)?.count || 0;
      return { date: key, buy: count("buy"), bulk: count("bulk") };
    });
    const total = byType.buy.count + byType.bulk.count;
    const today = daily[daily.length - 1];
    const yesterday = daily[daily.length - 2];
    const [productTotal, outOfStock] = await Promise.all([Product.countDocuments({}), Product.countDocuments({ inStock: false })]);

    return res.status(200).json({
      success: true,
      message: "Referral summary retrieved successfully",
      data: {
        total,
        converted: byStatus.CONVERTED,
        revenue: byType.buy.revenue + byType.bulk.revenue,
        today: today.buy + today.bulk,
        yesterday: yesterday ? yesterday.buy + yesterday.bulk : 0,
        byType,
        byStatus,
        daily,
        topProducts: result.topProducts.map((row) => ({ productId: row._id, name: row.name, total: row.total, buy: row.buy, bulk: row.total - row.buy, revenue: row.revenue })),
        products: { total: productTotal, outOfStock },
      },
    });
  } catch (error) { return sendError(res, error, "Referral"); }
};

module.exports = { trackReferral, goToNohar, createReferral, updateReferral, deleteReferral, listReferrals, getSummary };
