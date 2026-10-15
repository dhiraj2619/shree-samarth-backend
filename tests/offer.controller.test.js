const { test, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Offer = require("../models/offer.model");
const Product = require("../models/products.model");
const controller = require("../controllers/offer.controller");

afterEach(() => mock.restoreAll());
const id = new mongoose.Types.ObjectId().toString();
const productA = new mongoose.Types.ObjectId().toString();
const productB = new mongoose.Types.ObjectId().toString();
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } });
const valid = { title: "Get Flat Rs 1200 OFF on orders above Rs 6000", code: " diamond1200 ", discountType: "flat", discountValue: "1200", minOrderAmount: "6000" };

const saving = () => {
  mock.method(Offer, "exists", async () => null);
  mock.method(Offer.prototype, "save", async function () { return this; });
  mock.method(Offer.prototype, "populate", async function () { return this; });
};

test("create offer normalises code and type and applies to all products by default", async () => {
  saving();
  const res = response();
  await controller.createOffer({ body: valid }, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.data.code, "DIAMOND1200");
  assert.equal(res.body.data.discountType, "FLAT");
  assert.equal(res.body.data.discountValue, 1200);
  assert.equal(res.body.data.minOrderAmount, 6000);
  assert.equal(res.body.data.applicableProducts.length, 0);
});

test("create accepts applicable products as a JSON string and removes duplicates", async () => {
  saving();
  mock.method(Product, "countDocuments", async (filter) => filter._id.$in.length);
  const res = response();
  await controller.createOffer({ body: { ...valid, applicableProducts: JSON.stringify([productA, productB, productA]) } }, res);
  assert.equal(res.code, 201);
  assert.deepEqual(res.body.data.applicableProducts.map(String), [productA, productB]);
});

test("unknown applicable products are rejected", async () => {
  saving();
  mock.method(Product, "countDocuments", async () => 1);
  const res = response();
  await controller.createOffer({ body: { ...valid, applicableProducts: [productA, productB] } }, res);
  assert.equal(res.code, 404);
  assert.match(res.body.message, /does not exist/);
});

test("create requires title, code, discount type and value", async () => {
  for (const key of ["title", "code", "discountType", "discountValue"]) {
    const body = { ...valid };
    delete body[key];
    const res = response();
    await controller.createOffer({ body }, res);
    assert.equal(res.code, 400, key);
    assert.match(res.body.message, new RegExp(`${key} is required`));
  }
});

test("discount rules are enforced", async () => {
  saving();
  for (const [body, message] of [
    [{ discountValue: "0" }, /more than 0/],
    [{ discountValue: "-5" }, /cannot be negative/],
    [{ discountType: "PERCENTAGE", discountValue: "120" }, /cannot be more than 100/],
    [{ discountValue: "7000" }, /cannot be more than the minimum order amount/],
    [{ discountType: "BOGO" }, /discountType must be one of/],
    [{ code: "a b" }, /code must be 3 to 30/],
  ]) {
    const res = response();
    await controller.createOffer({ body: { ...valid, ...body } }, res);
    assert.equal(res.code, 400, JSON.stringify(body));
    assert.match(res.body.message, message);
  }
});

test("codes must be unique across offers", async () => {
  let filter;
  mock.method(Offer, "exists", async (value) => { filter = value; return { _id: id }; });
  const res = response();
  await controller.createOffer({ body: valid }, res);
  assert.equal(res.code, 409);
  assert.equal(filter.code, "DIAMOND1200");
});

test("update checks the discount against the offer's saved values", async () => {
  const doc = new Offer({ title: "Ten percent", code: "TEN", discountType: "PERCENTAGE", discountValue: 10 });
  mock.method(Offer, "findById", async () => doc);
  mock.method(doc, "save", async () => doc);
  mock.method(doc, "populate", async () => doc);
  const tooMuch = response();
  await controller.updateOffer({ params: { id }, body: { discountValue: "150" } }, tooMuch);
  assert.equal(tooMuch.code, 400);
  const ok = response();
  await controller.updateOffer({ params: { id }, body: { discountValue: "15", applicableProducts: [] } }, ok);
  assert.equal(ok.code, 200);
  assert.equal(doc.discountValue, 15);
});

test("delete returns 404 for a missing offer", async () => {
  mock.method(Offer, "findByIdAndDelete", async () => null);
  const res = response();
  await controller.deleteOffer({ params: { id } }, res);
  assert.equal(res.code, 404);
});
