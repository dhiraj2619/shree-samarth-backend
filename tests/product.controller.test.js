const { test, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;
const Product = require("../models/products.model");
const Category = require("../models/categories.model");
const controller = require("../controllers/product.controller");

afterEach(() => mock.restoreAll());
const id = new mongoose.Types.ObjectId().toString();
const body = { name: "Product", description: "Description", categoryId: id };
const file = () => ({ buffer: Buffer.from("image"), mimetype: "image/png" });
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } });
const references = () => mock.method(Category, "exists", async () => ({ _id: id }));
let uploads = 0;
const mockUpload = () => mock.method(cloudinary.uploader, "upload", async () => {
  uploads += 1;
  return { public_id: `samarth/products/images/new-${uploads}`, secure_url: `https://example.com/new-${uploads}.png` };
});
const image = (name) => ({ public_id: `samarth/products/images/${name}`, url: `https://example.com/${name}.png` });

test("create stores the admin catalogue fields and never a price", async () => {
  references();
  mockUpload();
  mock.method(Product.prototype, "save", async function () { return this; });
  const res = response();
  await controller.createProduct({
    body: { ...body, price: 999, ratings: "4.56", rewardPoints: "50", inStock: "false", isMostBuy: "true", hsnCode: "3004", gstRate: "12", buyNowUrl: "https://nohar.in/product/abc", bulkPurchaseUrl: "" },
    files: { images: [file()] },
  }, res);
  assert.equal(res.code, 201);
  const data = res.body.data.toObject();
  assert.equal(data.price, undefined);
  assert.equal(data.ratings, 4.6);
  assert.equal(data.rewardPoints, 50);
  assert.equal(data.inStock, false);
  assert.equal(data.isMostBuy, true);
  assert.equal(data.hsnCode, "3004");
  assert.equal(data.gstRate, 12);
  assert.equal(data.buyNowUrl, "https://nohar.in/product/abc");
  assert.equal(data.images.length, 1);
});

test("create requires at least one image", async () => {
  references();
  const res = response();
  await controller.createProduct({ body }, res);
  assert.equal(res.code, 400);
  assert.match(res.body.message, /image/);
});

test("create rejects malformed admin fields", async () => {
  references();
  for (const invalid of [
    { ratings: 6 }, { ratings: "abc" }, { rewardPoints: -1 }, { rewardPoints: 1.5 }, { gstRate: 7 },
    { hsnCode: "12" }, { hsnCode: "abcd" }, { buyNowUrl: "https://evil.example/x" }, { bulkPurchaseUrl: "http://nohar.in" },
    { inStock: "yes" }, { categoryId: {} }, { seo: "bad json" }, { name: " " },
  ]) {
    const bad = response();
    await controller.createProduct({ body: { ...body, ...invalid }, files: { images: [file()] } }, bad);
    assert.equal(bad.code, 400, JSON.stringify(invalid));
  }
});

test("missing category returns 404 before uploading", async () => {
  mock.method(Category, "exists", async () => null);
  const upload = mock.method(cloudinary.uploader, "upload", async () => assert.fail("Unexpected upload"));
  const res = response();
  await controller.createProduct({ body, files: { images: [file()] } }, res);
  assert.equal(res.code, 404);
  assert.equal(upload.mock.callCount(), 0);
});

test("partial update preserves omitted fields, images and SEO values", async () => {
  const product = new Product({ ...body, isMostBuy: true, hsnCode: "3004", images: [image("a")], seo: { titleTag: "Existing title", keywords: "original" } });
  mock.method(Product, "findById", async () => product);
  mock.method(product, "save", async () => product);
  const res = response();
  await controller.updateProduct({ params: { id }, body: { seoDescription: "New description", inStock: "false" } }, res);
  assert.equal(res.code, 200);
  assert.equal(product.inStock, false);
  assert.equal(product.isMostBuy, true);
  assert.equal(product.hsnCode, "3004");
  assert.equal(product.images.length, 1);
  assert.equal(product.seo.titleTag, "Existing title");
  assert.equal(product.seo.metaDescription, "New description");
});

test("update keeps, reorders and replaces individual images", async () => {
  const product = new Product({ ...body, images: [image("a"), image("b"), image("c")] });
  mock.method(Product, "findById", async () => product);
  mock.method(product, "save", async () => product);
  mockUpload();
  const destroy = mock.method(cloudinary.uploader, "destroy", async () => ({}));
  const res = response();
  // Replace "b" in place, drop "c", put "a" second, and append one more upload.
  await controller.updateProduct({
    params: { id },
    body: { existingImages: JSON.stringify(["__new__", "samarth/products/images/a"]) },
    files: { images: [file(), file()] },
  }, res);
  assert.equal(res.code, 200);
  const ids = product.images.map((img) => img.public_id);
  assert.equal(ids.length, 3);
  assert.match(ids[0], /new-/);
  assert.equal(ids[1], "samarth/products/images/a");
  assert.match(ids[2], /new-/);
  assert.deepEqual(destroy.mock.calls.map((call) => call.arguments[0]).sort(), ["samarth/products/images/b", "samarth/products/images/c"]);
});

test("update rejects removing every image or foreign image ids", async () => {
  const product = new Product({ ...body, images: [image("a")] });
  mock.method(Product, "findById", async () => product);
  for (const existingImages of [[], ["samarth/products/images/other"], ["__new__"]]) {
    const res = response();
    await controller.updateProduct({ params: { id }, body: { existingImages } }, res);
    assert.equal(res.code, 400, JSON.stringify(existingImages));
  }
});

test("failed save cleans newly uploaded images", async () => {
  references();
  mock.method(cloudinary.uploader, "upload", async () => ({ public_id: "samarth/products/images/new", secure_url: "https://example.com/new.png" }));
  const destroy = mock.method(cloudinary.uploader, "destroy", async () => ({}));
  mock.method(Product.prototype, "save", async () => { const error = new Error("Invalid document"); error.name = "ValidationError"; throw error; });
  const res = response();
  await controller.createProduct({ body, files: { images: [file()] } }, res);
  assert.equal(res.code, 400);
  assert.equal(destroy.mock.calls[0].arguments[0], "samarth/products/images/new");
});

test("uploads without existingImages replace the list after successful persistence", async () => {
  const product = new Product({ ...body, images: [image("old")] });
  let saved = false;
  mock.method(Product, "findById", async () => product);
  mock.method(product, "save", async () => { saved = true; return product; });
  mockUpload();
  const destroy = mock.method(cloudinary.uploader, "destroy", async () => { assert.ok(saved); });
  const res = response();
  await controller.updateProduct({ params: { id }, body: {}, files: { images: [file()] } }, res);
  assert.equal(res.code, 200);
  assert.equal(product.images.length, 1);
  assert.equal(destroy.mock.calls[0].arguments[0], "samarth/products/images/old");
});

test("public listing filters inactive products, searches name/description/HSN, and paginates", async () => {
  let filter;
  const query = {
    populate() { return this; }, sort() { return this; },
    skip(value) { assert.equal(value, 10); return this; },
    limit(value) { assert.equal(value, 10); return Promise.resolve([]); },
  };
  mock.method(Product, "find", (value) => { filter = value; return query; });
  mock.method(Product, "countDocuments", async () => 25);
  const res = response();
  await controller.getAllProducts({ query: { search: ".*", page: "2", limit: "10", isActive: "false", inStock: "true" } }, res);
  assert.equal(res.code, 200);
  assert.equal(filter.isActive, true);
  assert.equal(filter.inStock, true);
  assert.deepEqual(filter.$or.map((clause) => Object.keys(clause)[0]), ["name", "description", "hsnCode"]);
  assert.equal(filter.$or[0].name.$regex, "\\.\\*");
  assert.deepEqual(res.body.pagination, { page: 2, limit: 10, total: 25, pages: 3 });
});

test("bad pagination and IDs return 400", async () => {
  const res = response();
  await controller.getAllProducts({ query: { limit: "101" } }, res);
  assert.equal(res.code, 400);
  for (const name of ["getProductById", "getAdminProductById", "deleteProduct"]) {
    const bad = response();
    await controller[name]({ params: { id: "invalid" } }, bad);
    assert.equal(bad.code, 400);
  }
});

test("public details query active products only; admin details include inactive", async () => {
  const filters = [];
  mock.method(Product, "findOne", (filter) => {
    filters.push(filter);
    return { populate() { return this; }, then(resolve) { return Promise.resolve(null).then(resolve); } };
  });
  await controller.getProductById({ params: { id } }, response());
  await controller.getAdminProductById({ params: { id } }, response());
  assert.deepEqual(filters, [{ _id: id, isActive: true }, { _id: id }]);
});

test("deletion cleans only Samarth-owned images", async () => {
  mock.method(Product, "findByIdAndDelete", async () => ({ images: [{ public_id: "samarth/products/images/old" }, { public_id: "other-project/image" }], guideImage: null }));
  const destroy = mock.method(cloudinary.uploader, "destroy", async () => ({}));
  const res = response();
  await controller.deleteProduct({ params: { id } }, res);
  assert.equal(res.code, 200);
  assert.equal(destroy.mock.callCount(), 1);
});
