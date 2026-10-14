const Product = require("../models/products.model");
const Category = require("../models/categories.model");
const {
  fail, validId, boolean, text, array, object, positiveInteger, searchPattern, sendError, uploadImage, cleanup,
} = require("../utils/helpers");

const MAX_IMAGES = 10;
const NOHAR_URL = /^https:\/\/(www\.)?nohar\.in(\/\S*)?$/i;
const NEW_IMAGE = "__new__";

const seoAliases = {
  titleTag: "seoTitle", metaDescription: "seoDescription", keywords: "seoKeywords",
  canonicalUrl: "seoCanonicalUrl", metaRobots: "seoRobots",
};
const shareFields = ["ogTitle", "ogDescription", "ogImageUrl", "ogType", "twitterTitle", "twitterDescription", "twitterImageUrl"];

const parseFields = (body = {}) => {
  const fields = {};
  for (const key of ["name", "description"]) {
    if (body[key] !== undefined) fields[key] = text(body[key], key, { required: true });
  }
  if (body.categoryId !== undefined) fields.categoryId = validId(body.categoryId, "categoryId");
  for (const key of ["inStock", "isMostBuy", "isActive", "isFeatured"]) {
    if (body[key] !== undefined) fields[key] = boolean(body[key], key);
  }
  for (const key of ["buyNowUrl", "bulkPurchaseUrl"]) {
    if (body[key] !== undefined) {
      const url = text(body[key], key, { max: 500 });
      if (url && !NOHAR_URL.test(url)) fail(`${key} must be a https://nohar.in link`);
      fields[key] = url;
    }
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

const checkCategory = async (fields) => {
  if (fields.categoryId !== undefined && !(await Category.exists({ _id: fields.categoryId }))) fail("Category not found", 404);
};

// Works out the final image list before anything is uploaded.
// `existingImages` lists the public_ids to keep, in display order. A "__new__" entry
// marks where the next uploaded file goes, so one slot can be replaced in place.
// Uploads not placed by a marker are appended. Without `existingImages`, uploads
// replace the whole list, and no uploads leaves the images untouched.
const planImages = (product, body, uploadCount, creating) => {
  if (body.existingImages === undefined && !uploadCount) {
    if (creating) fail("At least one product image is required");
    return null;
  }
  const current = new Map(product.images.map((image) => [image.public_id, { public_id: image.public_id, url: image.url }]));
  const slots = [];
  let placed = 0;
  if (body.existingImages !== undefined && !creating) {
    const seen = new Set();
    for (const entry of array(body.existingImages, "existingImages")) {
      if (entry === NEW_IMAGE) {
        if (placed >= uploadCount) fail(`existingImages has more "${NEW_IMAGE}" entries than uploaded images`);
        slots.push(placed++);
      } else {
        if (typeof entry !== "string" || !current.has(entry)) fail("existingImages contains an image that does not belong to this product");
        if (seen.has(entry)) fail("existingImages contains duplicates");
        seen.add(entry);
        slots.push(current.get(entry));
      }
    }
  }
  while (placed < uploadCount) slots.push(placed++);
  if (slots.length < 1) fail("At least one product image is required");
  if (slots.length > MAX_IMAGES) fail(`A product can have at most ${MAX_IMAGES} images`);
  const kept = new Set(slots.filter((slot) => typeof slot !== "number").map((image) => image.public_id));
  return { slots, removed: product.images.filter((image) => !kept.has(image.public_id)) };
};

const populated = (query) => query.populate("categoryId", "name");

const writeProduct = async (req, res, updating) => {
  const uploaded = [];
  let saved = false;
  try {
    const body = req.body || {};
    const fields = parseFields(body);
    let product;
    if (updating) {
      product = await Product.findById(validId(req.params.id, "product id"));
      if (!product) fail("Product not found", 404);
    } else {
      for (const key of ["name", "description", "categoryId"]) {
        if (fields[key] === undefined) fail(`${key} is required`);
      }
      product = new Product();
    }
    await checkCategory(fields);
    product.set(fields);
    const imageFiles = req.files?.images || [];
    const plan = planImages(product, body, imageFiles.length, !updating);
    await product.validate();

    const oldAssets = [];
    if (plan) {
      const fresh = [];
      for (const file of imageFiles) fresh.push(await uploadImage(file, "samarth/products/images", uploaded));
      product.images = plan.slots.map((slot) => (typeof slot === "number" ? fresh[slot] : slot));
      oldAssets.push(...plan.removed);
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
    return sendError(res, error, "Product");
  }
};

const createProduct = (req, res) => writeProduct(req, res, false);
const updateProduct = (req, res) => writeProduct(req, res, true);

const listProducts = async (req, res, extraFilter = {}, admin = false) => {
  try {
    const query = req.query || {};
    const filter = admin ? {} : { isActive: true };
    if (query.categoryId !== undefined) filter.categoryId = validId(query.categoryId, "categoryId");
    for (const key of ["isFeatured", "isMostBuy", "inStock"]) {
      if (query[key] !== undefined) filter[key] = boolean(query[key], key);
    }
    if (admin && query.isActive !== undefined) filter.isActive = boolean(query.isActive, "isActive");
    if (query.search !== undefined) {
      const pattern = searchPattern(query.search);
      filter.$or = [{ name: pattern }, { description: pattern }];
    }
    Object.assign(filter, extraFilter);
    const page = positiveInteger(query.page, 1, 100000);
    const limit = positiveInteger(query.limit, 20, 100);
    const [products, total] = await Promise.all([
      populated(Product.find(filter)).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
      Product.countDocuments(filter),
    ]);
    return res.status(200).json({ success: true, message: "Products retrieved successfully", data: products, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { return sendError(res, error, "Product"); }
};

const getAllProducts = (req, res) => listProducts(req, res);
const getAdminProducts = (req, res) => listProducts(req, res, {}, true);
const getFeaturedProducts = (req, res) => listProducts(req, res, { isFeatured: true });
const getMostBuyProducts = (req, res) => listProducts(req, res, { isMostBuy: true });
const getProductsByCategories = async (req, res) => {
  try { return await listProducts(req, res, { categoryId: validId(req.params.categoryId, "categoryId") }); }
  catch (error) { return sendError(res, error, "Product"); }
};

const findOne = (admin) => async (req, res) => {
  try {
    const filter = { _id: validId(req.params.id, "product id") };
    if (!admin) filter.isActive = true;
    const product = await populated(Product.findOne(filter));
    if (!product) fail("Product not found", 404);
    return res.status(200).json({ success: true, message: "Product retrieved successfully", data: product });
  } catch (error) { return sendError(res, error, "Product"); }
};

const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(validId(req.params.id, "product id"));
    if (!product) fail("Product not found", 404);
    await cleanup([...product.images, product.guideImage]);
    return res.status(200).json({ success: true, message: "Product deleted successfully" });
  } catch (error) { return sendError(res, error, "Product"); }
};

module.exports = {
  createProduct, updateProduct, deleteProduct, getAllProducts, getAdminProducts,
  getFeaturedProducts, getMostBuyProducts,
  getProductById: findOne(false),
  getAdminProductById: findOne(true),
  getProductsByCategories,
};
