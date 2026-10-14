const Category = require("../models/categories.model");
const Product = require("../models/products.model");
const {
  fail, validId, boolean, text, positiveInteger, searchPattern, sendError, uploadImage, cleanup,
} = require("../utils/helpers");

const parseFields = (body = {}) => {
  const fields = {};
  if (body.name !== undefined) fields.name = text(body.name, "name", { required: true, max: 120 });
  if (body.description !== undefined) fields.description = text(body.description, "description", { max: 500 });
  if (body.isActive !== undefined) fields.isActive = boolean(body.isActive, "isActive");
  return fields;
};

const ensureUniqueName = async (name, id) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const filter = { name: { $regex: `^${escaped}$`, $options: "i" } };
  if (id) filter._id = { $ne: id };
  if (await Category.exists(filter)) fail(`A category named "${name}" already exists`, 409);
};

const writeCategory = async (req, res, updating) => {
  const uploaded = [];
  let saved = false;
  try {
    const body = req.body || {};
    const fields = parseFields(body);
    let category;
    if (updating) {
      category = await Category.findById(validId(req.params.id, "category id"));
      if (!category) fail("Category not found", 404);
    } else {
      if (fields.name === undefined) fail("name is required");
      category = new Category();
    }
    if (fields.name !== undefined) await ensureUniqueName(fields.name, updating ? category._id : null);
    category.set(fields);
    await category.validate();

    const oldAssets = [];
    const removeThumbnail = body.removeThumbnail !== undefined && boolean(body.removeThumbnail, "removeThumbnail");
    // Copy first: category.thumbnail is a live nested path that changes on reassignment.
    const previous = category.thumbnail?.public_id ? { public_id: category.thumbnail.public_id, url: category.thumbnail.url } : null;
    if (req.file) {
      oldAssets.push(previous);
      category.thumbnail = await uploadImage(req.file, "samarth/categories", uploaded);
    } else if (removeThumbnail) {
      oldAssets.push(previous);
      category.thumbnail = undefined;
    }
    await category.save();
    saved = true;
    await cleanup(oldAssets);
    return res.status(updating ? 200 : 201).json({ success: true, message: `Category ${updating ? "updated" : "created"} successfully`, data: category });
  } catch (error) {
    if (!saved) await cleanup(uploaded);
    return sendError(res, error, "Category");
  }
};

const productCounts = async (ids) => {
  const rows = await Product.aggregate([
    { $match: { categoryId: { $in: ids } } },
    { $group: { _id: "$categoryId", total: { $sum: 1 }, active: { $sum: { $cond: ["$isActive", 1, 0] } } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row]));
};

// Admins see every product in a category; the public sees only active ones.
const withCount = (category, counts, admin) => {
  const count = counts.get(String(category._id));
  return { ...category, productCount: admin ? count?.total || 0 : count?.active || 0 };
};

const listCategories = (admin) => async (req, res) => {
  try {
    const query = req.query || {};
    const filter = admin ? {} : { isActive: true };
    if (admin && query.isActive !== undefined) filter.isActive = boolean(query.isActive, "isActive");
    if (query.search !== undefined) filter.name = searchPattern(query.search);
    const page = positiveInteger(query.page, 1, 100000);
    const limit = positiveInteger(query.limit, 50, 100);
    const [categories, total] = await Promise.all([
      Category.find(filter).sort({ name: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      Category.countDocuments(filter),
    ]);
    const counts = await productCounts(categories.map((category) => category._id));
    const data = categories.map((category) => withCount(category, counts, admin));
    return res.status(200).json({ success: true, message: "Categories retrieved successfully", data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { return sendError(res, error, "Category"); }
};

const findCategory = (admin) => async (req, res) => {
  try {
    const filter = { _id: validId(req.params.id, "category id") };
    if (!admin) filter.isActive = true;
    const category = await Category.findOne(filter).lean();
    if (!category) fail("Category not found", 404);
    const counts = await productCounts([category._id]);
    return res.status(200).json({ success: true, message: "Category retrieved successfully", data: withCount(category, counts, admin) });
  } catch (error) { return sendError(res, error, "Category"); }
};

// Products require a valid category, so a category in use cannot be deleted.
const deleteCategory = async (req, res) => {
  try {
    const id = validId(req.params.id, "category id");
    const inUse = await Product.countDocuments({ categoryId: id });
    if (inUse) fail(`This category still has ${inUse} product${inUse === 1 ? "" : "s"}. Move or delete them first.`, 409);
    const category = await Category.findByIdAndDelete(id);
    if (!category) fail("Category not found", 404);
    await cleanup([category.thumbnail]);
    return res.status(200).json({ success: true, message: "Category deleted successfully" });
  } catch (error) { return sendError(res, error, "Category"); }
};

module.exports = {
  createCategory: (req, res) => writeCategory(req, res, false),
  updateCategory: (req, res) => writeCategory(req, res, true),
  deleteCategory,
  getAllCategories: listCategories(false),
  getAdminCategories: listCategories(true),
  getCategoryById: findCategory(false),
  getAdminCategoryById: findCategory(true),
};
