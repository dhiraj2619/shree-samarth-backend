const { test, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;
const Product = require("../models/products.model");
const Category = require("../models/categories.model");
const Collection = require("../models/collection.model");
const controller = require("../controllers/product.controller");

afterEach(() => mock.restoreAll());
const id = new mongoose.Types.ObjectId().toString();
const body = { name: "Product", description: "Description", categoryId: id, collectionId: id };
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } });
const references = () => {
  mock.method(Category, "exists", async () => ({ _id: id }));
  mock.method(Collection, "exists", async () => ({ _id: id }));
};

test("create allows no price, persists only catalogue fields", async () => {
  references();
  mock.method(Product.prototype, "save", async function () { return this; });
  const res = response();
  await controller.createProduct({ body: { ...body, rewardPoints: 100 } }, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.data.price, undefined);
  assert.equal(res.body.data.toObject().rewardPoints, undefined);
});

test("create accepts zero price and rejects malformed fields", async () => {
  references();
  mock.method(Product.prototype, "save", async function () { return this; });
  const res = response();
  await controller.createProduct({ body: { ...body, price: 0 } }, res);
  assert.equal(res.code, 201);
  for (const invalid of [{ price: "abc" }, { price: -1 }, { isActive: "yes" }, { categoryId: {} }, { seo: "bad json" }, { name: " " }]) {
    const bad = response();
    await controller.createProduct({ body: { ...body, ...invalid } }, bad);
    assert.equal(bad.code, 400);
  }
});

test("missing references return 404 before uploading", async () => {
  mock.method(Category, "exists", async () => null);
  const upload = mock.method(cloudinary.uploader, "upload", async () => assert.fail("Unexpected upload"));
  const res = response();
  await controller.createProduct({ body, files: { images: [{ buffer: Buffer.from("image"), mimetype: "image/png" }] } }, res);
  assert.equal(res.code, 404);
  assert.equal(upload.mock.callCount(), 0);
});

test("partial update preserves omitted fields and SEO values", async () => {
  const product = new Product({ ...body, isFeatured: true, seo: { titleTag: "Existing title", keywords: "original" } });
  mock.method(Product, "findById", async () => product);
  mock.method(product, "save", async () => product);
  const res = response();
  await controller.updateProduct({ params: { id }, body: { seoDescription: "New description", isActive: "false" } }, res);
  assert.equal(res.code, 200);
  assert.equal(product.isActive, false);
  assert.equal(product.isFeatured, true);
  assert.equal(product.seo.titleTag, "Existing title");
  assert.equal(product.seo.metaDescription, "New description");
});

test("failed save cleans newly uploaded images", async () => {
  references();
  mock.method(cloudinary.uploader, "upload", async () => ({ public_id: "samarth/products/images/new", secure_url: "https://example.com/new.png" }));
  const destroy = mock.method(cloudinary.uploader, "destroy", async () => ({}));
  mock.method(Product.prototype, "save", async () => { const error = new Error("Invalid document"); error.name = "ValidationError"; throw error; });
  const res = response();
  await controller.createProduct({ body, files: { images: [{ buffer: Buffer.from("image"), mimetype: "image/png" }] } }, res);
  assert.equal(res.code, 400);
  assert.equal(destroy.mock.calls[0].arguments[0], "samarth/products/images/new");
});

test("replacement images are deleted only after successful persistence", async () => {
  const product = new Product({ ...body, images: [{ public_id: "samarth/products/images/old", url: "https://example.com/old.png" }] });
  let saved = false;
  mock.method(Product, "findById", async () => product);
  mock.method(product, "save", async () => { saved = true; return product; });
  mock.method(cloudinary.uploader, "upload", async () => ({ public_id: "samarth/products/images/new", secure_url: "https://example.com/new.png" }));
  const destroy = mock.method(cloudinary.uploader, "destroy", async () => { assert.ok(saved); });
  const res = response();
  await controller.updateProduct({ params: { id }, body: {}, files: { images: [{ buffer: Buffer.from("image"), mimetype: "image/png" }] } }, res);
  assert.equal(res.code, 200);
  assert.equal(destroy.mock.calls[0].arguments[0], "samarth/products/images/old");
});

test("public listing filters inactive products, escapes search, and paginates", async () => {
  let filter;
  const query = {
    populate() { return this; }, sort() { return this; },
    skip(value) { assert.equal(value, 10); return this; },
    limit(value) { assert.equal(value, 10); return Promise.resolve([]); },
  };
  mock.method(Product, "find", (value) => { filter = value; return query; });
  mock.method(Product, "countDocuments", async () => 25);
  const res = response();
  await controller.getAllProducts({ query: { search: ".*", page: "2", limit: "10", isActive: "false" } }, res);
  assert.equal(res.code, 200);
  assert.equal(filter.isActive, true);
  assert.equal(filter.name.$regex, "\\.\\*");
  assert.deepEqual(res.body.pagination, { page: 2, limit: 10, total: 25, pages: 3 });
});

test("bad pagination and IDs return 400", async () => {
  const res = response();
  await controller.getAllProducts({ query: { limit: "101" } }, res);
  assert.equal(res.code, 400);
  for (const name of ["getProductById", "deleteProduct"]) {
    const bad = response();
    await controller[name]({ params: { id: "invalid" } }, bad);
    assert.equal(bad.code, 400);
  }
});

test("public details query active products only", async () => {
  mock.method(Product, "findOne", (filter) => {
    assert.deepEqual(filter, { _id: id, isActive: true });
    return { populate() { return this; }, then(resolve) { return Promise.resolve(null).then(resolve); } };
  });
  const res = response();
  await controller.getProductById({ params: { id } }, res);
  assert.equal(res.code, 404);
});

test("deletion cleans only Samarth-owned images", async () => {
  mock.method(Product, "findByIdAndDelete", async () => ({ images: [{ public_id: "samarth/products/images/old" }, { public_id: "other-project/image" }], guideImage: null }));
  const destroy = mock.method(cloudinary.uploader, "destroy", async () => ({}));
  const res = response();
  await controller.deleteProduct({ params: { id } }, res);
  assert.equal(res.code, 200);
  assert.equal(destroy.mock.callCount(), 1);
});
