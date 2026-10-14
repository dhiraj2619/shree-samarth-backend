const { test, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Product = require("../models/products.model");
const Referral = require("../models/referral.model");
const controller = require("../controllers/referral.controller");

afterEach(() => mock.restoreAll());
const id = new mongoose.Types.ObjectId().toString();
const response = () => ({
  code: 200,
  status(code) { this.code = code; return this; },
  json(value) { this.body = value; return this; },
  redirect(code, url) { this.code = code; this.location = url; return this; },
});
const product = (links = {}) => ({ _id: id, name: "Diamond Energizer", buyNowUrl: "", bulkPurchaseUrl: "", ...links });
const findActive = (doc) => mock.method(Product, "findOne", (filter) => {
  assert.equal(filter.isActive, true);
  return { select: async () => doc };
});

test("track records a click and returns the product's Nohar link", async () => {
  findActive(product({ bulkPurchaseUrl: "https://nohar.in/bulk/diamond" }));
  const create = mock.method(Referral, "create", async (doc) => doc);
  const res = response();
  await controller.trackReferral({ body: { productId: id, type: "bulk", quantity: "50" } }, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.data.redirectUrl, "https://nohar.in/bulk/diamond");
  const saved = create.mock.calls[0].arguments[0];
  assert.equal(saved.productName, "Diamond Energizer");
  assert.equal(saved.quantity, 50);
  assert.equal(saved.source, "web");
});

test("buy now ignores quantity and falls back to the Nohar home page", async () => {
  findActive(product());
  const create = mock.method(Referral, "create", async (doc) => doc);
  const res = response();
  await controller.trackReferral({ body: { productId: id, type: "buy", quantity: "99" } }, res);
  assert.equal(res.body.data.redirectUrl, "https://nohar.in");
  assert.equal(create.mock.calls[0].arguments[0].quantity, 1);
});

test("track validates type, product id and existence", async () => {
  for (const body of [{ productId: id, type: "steal" }, { productId: "nope", type: "buy" }, { productId: id, type: "bulk", quantity: "0" }]) {
    const res = response();
    await controller.trackReferral({ body }, res);
    assert.equal(res.code, 400, JSON.stringify(body));
  }
  findActive(null);
  const missing = response();
  await controller.trackReferral({ body: { productId: id, type: "buy" } }, missing);
  assert.equal(missing.code, 404);
});

test("go link redirects even when recording fails", async () => {
  findActive(product({ buyNowUrl: "https://nohar.in/p/1" }));
  mock.method(Referral, "create", async (doc) => doc);
  const ok = response();
  await controller.goToNohar({ params: { productId: id }, query: {} }, ok);
  assert.equal(ok.code, 302);
  assert.equal(ok.location, "https://nohar.in/p/1");
  const bad = response();
  await controller.goToNohar({ params: { productId: "nope" }, query: {} }, bad);
  assert.equal(bad.code, 302);
  assert.equal(bad.location, "https://nohar.in");
});

test("marking converted requires an order value; other outcomes clear it", async () => {
  const referral = new Referral({ product: id, productName: "X", type: "buy" });
  mock.method(Referral, "findById", async () => referral);
  mock.method(referral, "save", async () => referral);
  const missing = response();
  await controller.updateReferral({ params: { id }, body: { status: "CONVERTED" } }, missing);
  assert.equal(missing.code, 400);
  const ok = response();
  await controller.updateReferral({ params: { id }, body: { status: "CONVERTED", orderValue: "1750", noharOrderId: " NH-1 " } }, ok);
  assert.equal(ok.code, 200);
  assert.equal(referral.orderValue, 1750);
  assert.equal(referral.noharOrderId, "NH-1");
  const lost = response();
  await controller.updateReferral({ params: { id }, body: { status: "NOT_CONVERTED" } }, lost);
  assert.equal(referral.orderValue, null);
  assert.equal(referral.noharOrderId, "");
  const invalid = response();
  await controller.updateReferral({ params: { id }, body: { status: "PAID" } }, invalid);
  assert.equal(invalid.code, 400);
});

test("admin can log a referral by hand but not in the future", async () => {
  mock.method(Product, "findById", () => ({ select: async () => product() }));
  const create = mock.method(Referral, "create", async (doc) => doc);
  const res = response();
  await controller.createReferral({ body: { productId: id, type: "buy", status: "CONVERTED", orderValue: 900, redirectedAt: "2026-01-02T10:00:00Z" } }, res);
  assert.equal(res.code, 201);
  assert.equal(create.mock.calls[0].arguments[0].source, "admin");
  assert.equal(create.mock.calls[0].arguments[0].orderValue, 900);
  const future = response();
  await controller.createReferral({ body: { productId: id, type: "buy", redirectedAt: "2999-01-01" } }, future);
  assert.equal(future.code, 400);
});

test("list filters by type, status and search with pagination", async () => {
  let filter;
  mock.method(Referral, "find", (value) => { filter = value; return { sort() { return this; }, skip() { return this; }, limit: async () => [] }; });
  mock.method(Referral, "countDocuments", async () => 0);
  const res = response();
  await controller.listReferrals({ query: { type: "bulk", status: "REDIRECTED", search: "NH-(" } }, res);
  assert.equal(res.code, 200);
  assert.equal(filter.type, "bulk");
  assert.equal(filter.status, "REDIRECTED");
  assert.equal(filter.$or[1].noharOrderId.$regex, "NH-\\(");
});

test("summary shapes totals, statuses, daily series and stock counts", async () => {
  mock.method(Referral, "aggregate", async () => [{
    byType: [{ _id: "buy", count: 7, converted: 3, revenue: 4500, units: 7 }, { _id: "bulk", count: 3, converted: 1, revenue: 20000, units: 120 }],
    byStatus: [{ _id: "CONVERTED", count: 4 }, { _id: "REDIRECTED", count: 5 }, { _id: "NOT_CONVERTED", count: 1 }],
    daily: [],
    topProducts: [{ _id: id, name: "Diamond", total: 6, buy: 4, revenue: 9000 }],
  }]);
  mock.method(Product, "countDocuments", async (filter) => (filter.inStock === false ? 1 : 4));
  const res = response();
  await controller.getSummary({ query: { days: "7" } }, res);
  const data = res.body.data;
  assert.equal(res.code, 200);
  assert.equal(data.total, 10);
  assert.equal(data.revenue, 24500);
  assert.equal(data.byStatus.REDIRECTED, 5);
  assert.equal(data.daily.length, 7);
  assert.deepEqual(data.topProducts[0], { productId: id, name: "Diamond", total: 6, buy: 4, bulk: 2, revenue: 9000 });
  assert.deepEqual(data.products, { total: 4, outOfStock: 1 });
});
