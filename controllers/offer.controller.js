const Offer = require("../models/offer.model");
const Product = require("../models/products.model");
const {
  fail, validId, text, array, positiveInteger, searchPattern, sendError,
} = require("../utils/helpers");

const DISCOUNT_TYPES = ["FLAT", "PERCENTAGE"];

const amount = (value, field) => {
  if (!["number", "string"].includes(typeof value) || String(value).trim() === "" || !Number.isFinite(Number(value))) fail(`${field} must be a number`);
  const number = Number(value);
  if (number < 0) fail(`${field} cannot be negative`);
  return Math.round(number * 100) / 100;
};

const parseFields = (body = {}) => {
  const fields = {};
  if (body.title !== undefined) fields.title = text(body.title, "title", { required: true, max: 150 });
  if (body.description !== undefined) fields.description = text(body.description, "description", { max: 1000 });
  if (body.code !== undefined) {
    const code = text(body.code, "code", { required: true, max: 30 }).toUpperCase();
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) fail("code must be 3 to 30 letters, numbers, - or _");
    fields.code = code;
  }
  if (body.discountType !== undefined) {
    const type = text(body.discountType, "discountType").toUpperCase();
    if (!DISCOUNT_TYPES.includes(type)) fail(`discountType must be one of ${DISCOUNT_TYPES.join(", ")}`);
    fields.discountType = type;
  }
  if (body.discountValue !== undefined) fields.discountValue = amount(body.discountValue, "discountValue");
  if (body.minOrderAmount !== undefined) fields.minOrderAmount = body.minOrderAmount === "" ? 0 : amount(body.minOrderAmount, "minOrderAmount");
  if (body.applicableProducts !== undefined) {
    const ids = array(body.applicableProducts, "applicableProducts").map((id) => validId(id, "product id in applicableProducts"));
    fields.applicableProducts = [...new Set(ids)];
  }
  return fields;
};

// Checks rules that depend on more than one field, using the offer's final values.
const checkDiscount = (offer) => {
  if (!(offer.discountValue > 0)) fail("discountValue must be more than 0");
  if (offer.discountType === "PERCENTAGE" && offer.discountValue > 100) fail("A percentage discount cannot be more than 100");
  if (offer.discountType === "FLAT" && offer.minOrderAmount > 0 && offer.discountValue > offer.minOrderAmount) {
    fail("A flat discount cannot be more than the minimum order amount");
  }
};

const ensureUniqueCode = async (code, id) => {
  const filter = { code };
  if (id) filter._id = { $ne: id };
  if (await Offer.exists(filter)) fail(`The code "${code}" is already used by another offer`, 409);
};

const checkProducts = async (ids) => {
  if (!ids?.length) return;
  const found = await Product.countDocuments({ _id: { $in: ids } });
  if (found !== ids.length) fail("applicableProducts contains a product that does not exist", 404);
};

const populated = (query) => query.populate("applicableProducts", "name images isActive");

const writeOffer = async (req, res, updating) => {
  try {
    const fields = parseFields(req.body || {});
    let offer;
    if (updating) {
      offer = await Offer.findById(validId(req.params.id, "offer id"));
      if (!offer) fail("Offer not found", 404);
    } else {
      for (const key of ["title", "code", "discountType", "discountValue"]) {
        if (fields[key] === undefined) fail(`${key} is required`);
      }
      offer = new Offer();
    }
    if (fields.code !== undefined) await ensureUniqueCode(fields.code, updating ? offer._id : null);
    await checkProducts(fields.applicableProducts);
    offer.set(fields);
    checkDiscount(offer);
    await offer.save();
    await offer.populate("applicableProducts", "name images isActive");
    return res.status(updating ? 200 : 201).json({ success: true, message: `Offer ${updating ? "updated" : "created"} successfully`, data: offer });
  } catch (error) {
    return sendError(res, error, "Offer");
  }
};

const listOffers = async (req, res) => {
  try {
    const query = req.query || {};
    const filter = {};
    if (query.search !== undefined) {
      const pattern = searchPattern(query.search);
      filter.$or = [{ title: pattern }, { code: pattern }, { description: pattern }];
    }
    if (query.discountType !== undefined) {
      const type = text(query.discountType, "discountType").toUpperCase();
      if (!DISCOUNT_TYPES.includes(type)) fail(`discountType must be one of ${DISCOUNT_TYPES.join(", ")}`);
      filter.discountType = type;
    }
    if (query.productId !== undefined) {
      // Offers for one product: those listing it, plus those that apply to every product.
      const productId = validId(query.productId, "productId");
      filter.$and = [{ $or: [{ applicableProducts: productId }, { applicableProducts: { $size: 0 } }] }];
    }
    const page = positiveInteger(query.page, 1, 100000);
    const limit = positiveInteger(query.limit, 20, 100);
    const [offers, total] = await Promise.all([
      populated(Offer.find(filter)).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Offer.countDocuments(filter),
    ]);
    return res.status(200).json({ success: true, message: "Offers retrieved successfully", data: offers, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { return sendError(res, error, "Offer"); }
};

const getOfferById = async (req, res) => {
  try {
    const offer = await populated(Offer.findById(validId(req.params.id, "offer id"))).lean();
    if (!offer) fail("Offer not found", 404);
    return res.status(200).json({ success: true, message: "Offer retrieved successfully", data: offer });
  } catch (error) { return sendError(res, error, "Offer"); }
};

// Public: look up an offer by the code a customer typed.
const getOfferByCode = async (req, res) => {
  try {
    const code = text(req.params.code, "code", { required: true, max: 30 }).toUpperCase();
    const offer = await populated(Offer.findOne({ code })).lean();
    if (!offer) fail("Offer not found", 404);
    return res.status(200).json({ success: true, message: "Offer retrieved successfully", data: offer });
  } catch (error) { return sendError(res, error, "Offer"); }
};

const deleteOffer = async (req, res) => {
  try {
    const offer = await Offer.findByIdAndDelete(validId(req.params.id, "offer id"));
    if (!offer) fail("Offer not found", 404);
    return res.status(200).json({ success: true, message: "Offer deleted successfully" });
  } catch (error) { return sendError(res, error, "Offer"); }
};

module.exports = {
  createOffer: (req, res) => writeOffer(req, res, false),
  updateOffer: (req, res) => writeOffer(req, res, true),
  deleteOffer,
  getAllOffers: listOffers,
  getAdminOffers: listOffers,
  getOfferById,
  getOfferByCode,
};
