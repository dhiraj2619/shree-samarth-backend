const { test, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;
const Product = require("../models/products.model");
const Category = require("../models/categories.model");
const controller = require("../controllers/category.controller");

afterEach(() => mock.restoreAll());
const id = new mongoose.Types.ObjectId().toString();
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } });

test("create category with description, status and thumbnail", async () => {
  mock.method(Category, "exists", async () => null);
  mock.method(Category.prototype, "save", async function () { return this; });
  mock.method(cloudinary.uploader, "upload", async () => ({ public_id: "samarth/categories/thumb", secure_url: "https://example.com/thumb.png" }));
  const res = response();
  await controller.createCategory({ body: { name: "  Health & Wellness ", description: "Daily wellness", isActive: "false" }, file: { buffer: Buffer.from("x"), mimetype: "image/png" } }, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.data.name, "Health & Wellness");
  assert.equal(res.body.data.description, "Daily wellness");
  assert.equal(res.body.data.isActive, false);
  assert.equal(res.body.data.thumbnail.public_id, "samarth/categories/thumb");
});

test("category names must be present and unique (case-insensitive)", async () => {
  const missing = response();
  await controller.createCategory({ body: { description: "x" } }, missing);
  assert.equal(missing.code, 400);
  let filter;
  mock.method(Category, "exists", async (value) => { filter = value; return { _id: id }; });
  const duplicate = response();
  await controller.createCategory({ body: { name: "Herbal (Care)" } }, duplicate);
  assert.equal(duplicate.code, 409);
  assert.equal(filter.name.$regex, "^Herbal \\(Care\\)$");
  assert.equal(filter.name.$options, "i");
});

test("rename checks uniqueness against other categories only", async () => {
  const doc = new Category({ name: "Ayurveda" });
  mock.method(Category, "findById", async () => doc);
  let filter;
  mock.method(Category, "exists", async (value) => { filter = value; return null; });
  mock.method(doc, "save", async () => doc);
  const res = response();
  await controller.updateCategory({ params: { id }, body: { name: "Ayurvedic" } }, res);
  assert.equal(res.code, 200);
  assert.equal(doc.name, "Ayurvedic");
  assert.deepEqual(filter._id, { $ne: doc._id });
});

test("update can remove the thumbnail and cleans it after saving", async () => {
  const doc = new Category({ name: "Nutrition", thumbnail: { public_id: "samarth/categories/old", url: "https://example.com/old.png" } });
  mock.method(Category, "findById", async () => doc);
  let saved = false;
  mock.method(doc, "save", async () => { saved = true; return doc; });
  const destroy = mock.method(cloudinary.uploader, "destroy", async () => { assert.ok(saved); });
  const res = response();
  await controller.updateCategory({ params: { id }, body: { removeThumbnail: "true", description: "Updated" } }, res);
  assert.equal(res.code, 200);
  assert.equal(doc.description, "Updated");
  assert.equal(doc.thumbnail?.public_id, undefined);
  assert.equal(destroy.mock.calls[0].arguments[0], "samarth/categories/old");
});

test("categories still holding products cannot be deleted", async () => {
  mock.method(Product, "countDocuments", async () => 3);
  const remove = mock.method(Category, "findByIdAndDelete", async () => assert.fail("Should not delete"));
  const res = response();
  await controller.deleteCategory({ params: { id } }, res);
  assert.equal(res.code, 409);
  assert.match(res.body.message, /3 products/);
  assert.equal(remove.mock.callCount(), 0);
});

test("empty category is deleted with its thumbnail", async () => {
  mock.method(Product, "countDocuments", async () => 0);
  mock.method(Category, "findByIdAndDelete", async () => ({ thumbnail: { public_id: "samarth/categories/t" } }));
  const destroy = mock.method(cloudinary.uploader, "destroy", async () => ({}));
  const res = response();
  await controller.deleteCategory({ params: { id } }, res);
  assert.equal(res.code, 200);
  assert.equal(destroy.mock.callCount(), 1);
});

test("public list shows active categories with active product counts; admin sees totals", async () => {
  const filters = [];
  const docs = [{ _id: new mongoose.Types.ObjectId(id), name: "Ayurveda" }];
  mock.method(Category, "find", (filter) => {
    filters.push(filter);
    return { sort() { return this; }, skip() { return this; }, limit() { return this; }, lean: async () => docs };
  });
  mock.method(Category, "countDocuments", async () => 1);
  mock.method(Product, "aggregate", async () => [{ _id: id, total: 5, active: 3 }]);
  const pub = response();
  await controller.getAllCategories({ query: { isActive: "false" } }, pub);
  const admin = response();
  await controller.getAdminCategories({ query: { isActive: "false" } }, admin);
  assert.deepEqual(filters, [{ isActive: true }, { isActive: false }]);
  assert.equal(pub.body.data[0].productCount, 3);
  assert.equal(admin.body.data[0].productCount, 5);
});

test("invalid category ids return 400", async () => {
  for (const name of ["getCategoryById", "getAdminCategoryById", "deleteCategory", "updateCategory"]) {
    const res = response();
    await controller[name]({ params: { id: "nope" }, body: {} }, res);
    assert.equal(res.code, 400, name);
  }
});
