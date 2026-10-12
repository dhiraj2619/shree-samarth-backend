const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;
const Product = require("../models/products.model");
const Category = require("../models/categories.model");
const Collection = require("../models/collection.model");

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

const object = (value, field) => {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { fail(`${field} must be valid JSON`); }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${field} must be an object`);
  return value;
};

const seoAliases = {
  titleTag: "seoTitle", metaDescription: "seoDescription", keywords: "seoKeywords",
  canonicalUrl: "seoCanonicalUrl", metaRobots: "seoRobots",
};
const shareFields = ["ogTitle", "ogDescription", "ogImageUrl", "ogType", "twitterTitle", "twitterDescription", "twitterImageUrl"];

const parseFields = (body = {}) => {
  const fields = {};
  for (const key of ["name", "description"]) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== "string" || !body[key].trim()) fail(`${key} must be a non-empty string`);
      fields[key] = body[key].trim();
    }
  }
  if (body.price !== undefined) {
    if (!["number", "string"].includes(typeof body.price) || String(body.price).trim() === "" || !Number.isFinite(Number(body.price)) || Number(body.price) < 0) {
      fail("price must be a non-negative number");
    }
    fields.price = Number(body.price);
  }
  for (const key of ["isActive", "isFeatured"]) {
    if (body[key] !== undefined) fields[key] = boolean(body[key], key);
  }
  for (const key of ["categoryId", "collectionId"]) {
    if (body[key] !== undefined) fields[key] = validId(body[key], key);
  }
  for (const [group, keys] of [["seo", Object.keys(seoAliases)], ["socialShare", shareFields]]) {
    const nested = body[group] === undefined ? {} : object(body[group], group);
    for (const key of keys) {
      const value = nested[key] ?? body[seoAliases[key] || key] ?? body[key];
      if (value !== undefined) {
        if (typeof value !== "string") fail(`${group}.${key} must be a string`);
        fields[`${group}.${key}`] = value.trim();
      }
    }
  }
  return fields;
};

const checkReferences = async (fields) => {
  for (const [key, Model, label] of [["categoryId", Category, "Category"], ["collectionId", Collection, "Collection"]]) {
    if (fields[key] !== undefined && !(await Model.exists({ _id: fields[key] }))) {
      fail(`${label} not found`, 404);
    }
  }
};

const sendError = (res, error) => {
  const status = error.status || (["ValidationError", "CastError"].includes(error.name) ? 400 : 500);
  if (status === 500) console.error("Product operation failed:", error.message);
  return res.status(status).json({ success: false, message: status === 500 ? "Unable to complete product operation" : error.message });
};

// Only delete assets uploaded into Samarth's namespace by this controller.
const cleanup = async (assets) => {
  await Promise.all(assets.filter((asset) => asset?.public_id?.startsWith("samarth/products/")).map(async (asset) => {
    try { await cloudinary.uploader.destroy(asset.public_id); }
    catch (error) { console.error("Product image cleanup failed:", error.message); }
  }));
};

const uploadImage = async (file, folder, uploaded) => {
  const result = await cloudinary.uploader.upload(`data:${file.mimetype};base64,${file.buffer.toString("base64")}`, { folder });
  const asset = { public_id: result.public_id, url: result.secure_url };
  uploaded.push(asset);
  return asset;
};

const writeProduct = async (req, res, updating) => {
  const uploaded = [];
  let saved = false;
  try {
    const fields = parseFields(req.body);
    let product;
    if (updating) {
      product = await Product.findById(validId(req.params.id, "product id"));
      if (!product) fail("Product not found", 404);
    } else {
      for (const key of ["name", "description", "categoryId", "collectionId"]) {
        if (fields[key] === undefined) fail(`${key} is required`);
      }
      product = new Product();
    }
    await checkReferences(fields);
    product.set(fields);
    await product.validate();
    const oldAssets = [];
    const imageFiles = req.files?.images || [];
    if (imageFiles.length) {
      const images = [];
      for (const file of imageFiles) images.push(await uploadImage(file, "samarth/products/images", uploaded));
      oldAssets.push(...product.images);
      product.images = images;
    }
    if (req.files?.guideImage?.length) {
      oldAssets.push(product.guideImage);
      product.guideImage = await uploadImage(req.files.guideImage[0], "samarth/products/guide-images", uploaded);
    }
    await product.save();
    saved = true;
    await cleanup(oldAssets);
    return res.status(updating ? 200 : 201).json({ success: true, message: `Product ${updating ? "updated" : "created"} successfully`, data: product });
  } catch (error) {
    if (!saved) await cleanup(uploaded);
    return sendError(res, error);
  }
};

const createProduct = (req, res) => writeProduct(req, res, false);
const updateProduct = (req, res) => writeProduct(req, res, true);

const positiveInteger = (value, fallback, max) => {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > max) {
    fail(`Pagination must use positive integers (maximum ${max})`);
  }
  return Number(value);
};

const listProducts = async (req, res, extraFilter = {}, admin = false) => {
  try {
    const query = req.query || {};
    const filter = admin ? {} : { isActive: true };
    for (const key of ["categoryId", "collectionId"]) {
      if (query[key] !== undefined) filter[key] = validId(query[key], key);
    }
    if (query.isFeatured !== undefined) filter.isFeatured = boolean(query.isFeatured, "isFeatured");
    if (admin && query.isActive !== undefined) filter.isActive = boolean(query.isActive, "isActive");
    if (query.search !== undefined) {
      if (typeof query.search !== "string" || query.search.length > 200) fail("search must be a string of at most 200 characters");
      filter.name = { $regex: query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    }
    Object.assign(filter, extraFilter);
    const page = positiveInteger(query.page, 1, 100000);
    const limit = positiveInteger(query.limit, 20, 100);
    const [products, total] = await Promise.all([
      Product.find(filter).populate("categoryId", "name").populate("collectionId", "name").sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
      Product.countDocuments(filter),
    ]);
    return res.status(200).json({ success: true, message: "Products retrieved successfully", data: products, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { return sendError(res, error); }
};

const getAllProducts = (req, res) => listProducts(req, res);
const getAdminProducts = (req, res) => listProducts(req, res, {}, true);
const getFeaturedProducts = (req, res) => listProducts(req, res, { isFeatured: true });
const byReference = (key) => async (req, res) => {
  try { return await listProducts(req, res, { [key]: validId(req.params[key], key) }); }
  catch (error) { return sendError(res, error); }
};

const getProductById = async (req, res) => {
  try {
    const product = await Product.findOne({ _id: validId(req.params.id, "product id"), isActive: true }).populate("categoryId", "name").populate("collectionId", "name");
    if (!product) fail("Product not found", 404);
    return res.status(200).json({ success: true, message: "Product retrieved successfully", data: product });
  } catch (error) { return sendError(res, error); }
};

const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(validId(req.params.id, "product id"));
    if (!product) fail("Product not found", 404);
    await cleanup([...product.images, product.guideImage]);
    return res.status(200).json({ success: true, message: "Product deleted successfully" });
  } catch (error) { return sendError(res, error); }
};

module.exports = {
  createProduct, updateProduct, deleteProduct, getAllProducts, getAdminProducts,
  getFeaturedProducts, getProductById,
  getProductsBycollections: byReference("collectionId"),
  getProductsByCategories: byReference("categoryId"),
};
