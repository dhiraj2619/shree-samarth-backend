const { test, afterEach, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Lead = require("../models/lead.model");
const Product = require("../models/products.model");
const controller = require("../controllers/enquiry.controller");

beforeEach(() => controller.resetRateLimits());
afterEach(() => mock.restoreAll());
const id = new mongoose.Types.ObjectId().toString();
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } });
const valid = { name: " Asha Kulkarni ", phone: "+91 98765-43210", email: "Asha@Example.com", message: "Do you supply in Nashik?" };

test("contact form creates a general enquiry with a normalised phone and email", async () => {
  let saved;
  mock.method(Lead, "create", async (fields) => { saved = fields; return { _id: id, ...fields }; });
  const res = response();
  await controller.submitEnquiry({ body: valid, ip: "1.1.1.1" }, res);
  assert.equal(res.code, 201);
  assert.equal(saved.customerName, "Asha Kulkarni");
  assert.equal(saved.contact, "9876543210");
  assert.equal(saved.email, "asha@example.com");
  assert.equal(saved.leadType, "GENERAL_ENQUIRY");
});

test("an enquiry about a product is stored as a product enquiry", async () => {
  let saved;
  mock.method(Product, "exists", async () => ({ _id: id }));
  mock.method(Lead, "create", async (fields) => { saved = fields; return { _id: id }; });
  const res = response();
  await controller.submitEnquiry({ body: { ...valid, productId: id }, ip: "1.1.1.2" }, res);
  assert.equal(res.code, 201);
  assert.equal(saved.leadType, "PRODUCT_ENQUIRY");
  assert.equal(saved.product, id);
});

test("contact form validates name, phone, email and message", async () => {
  for (const [body, message] of [
    [{ name: "" }, /name must be a non-empty string/],
    [{ phone: "12345" }, /phone must be a valid/],
    [{ email: "not-an-email" }, /email must be a valid/],
    [{ message: "  " }, /message must be a non-empty string/],
  ]) {
    const res = response();
    await controller.submitEnquiry({ body: { ...valid, ...body }, ip: "1.1.1.3" }, res);
    assert.equal(res.code, 400, JSON.stringify(body));
    assert.match(res.body.message, message);
  }
});

test("filled honeypot is accepted silently but not saved", async () => {
  const create = mock.method(Lead, "create", async () => assert.fail("Should not save"));
  const res = response();
  await controller.submitEnquiry({ body: { ...valid, website: "spam.example" }, ip: "1.1.1.4" }, res);
  assert.equal(res.code, 201);
  assert.equal(create.mock.callCount(), 0);
});

test("more than five enquiries from one IP in ten minutes are refused", async () => {
  mock.method(Lead, "create", async () => ({ _id: id }));
  for (let i = 0; i < 5; i++) {
    const res = response();
    await controller.submitEnquiry({ body: valid, ip: "2.2.2.2" }, res);
    assert.equal(res.code, 201);
  }
  const blocked = response();
  await controller.submitEnquiry({ body: valid, ip: "2.2.2.2" }, blocked);
  assert.equal(blocked.code, 429);
});

test("status updates only accept known statuses", async () => {
  const bad = response();
  await controller.updateEnquiry({ params: { id }, body: { status: "DONE" } }, bad);
  assert.equal(bad.code, 400);
  mock.method(Lead, "findByIdAndUpdate", () => ({ populate: async () => ({ _id: id, status: "CONTACTED" }) }));
  const ok = response();
  await controller.updateEnquiry({ params: { id }, body: { status: "CONTACTED" } }, ok);
  assert.equal(ok.code, 200);
  assert.equal(ok.body.data.status, "CONTACTED");
});
