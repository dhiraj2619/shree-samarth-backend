const { test, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;
const Distributor = require("../models/distributor.model");
const controller = require("../controllers/distributor.controller");

afterEach(() => mock.restoreAll());
const id = new mongoose.Types.ObjectId().toString();
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } });
const valid = { companyName: " Shree Traders ", contactPerson: "Ravi Patil", mobile: "+91 98765-43210", website: "shreetraders.in", pincode: "411001", city: "Pune", state: "Maharashtra" };

test("create distributor normalises mobile and website, logo optional", async () => {
  mock.method(Distributor.prototype, "save", async function () { return this; });
  const res = response();
  await controller.createDistributor({ body: valid }, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.data.companyName, "Shree Traders");
  assert.equal(res.body.data.mobile, "9876543210");
  assert.equal(res.body.data.website, "https://shreetraders.in");
  assert.equal(res.body.data.logo?.public_id, undefined);
});

test("create uploads a logo when given", async () => {
  mock.method(Distributor.prototype, "save", async function () { return this; });
  mock.method(cloudinary.uploader, "upload", async () => ({ public_id: "samarth/distributors/l1", secure_url: "https://example.com/l1.png" }));
  const res = response();
  await controller.createDistributor({ body: valid, file: { buffer: Buffer.from("x"), mimetype: "image/png" } }, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.data.logo.public_id, "samarth/distributors/l1");
});

test("create requires every field except logo and website", async () => {
  for (const key of ["companyName", "contactPerson", "mobile", "pincode", "city", "state"]) {
    const body = { ...valid };
    delete body[key];
    const res = response();
    await controller.createDistributor({ body }, res);
    assert.equal(res.code, 400, key);
    assert.match(res.body.message, new RegExp(`${key} is required`));
  }
  const res = response();
  mock.method(Distributor.prototype, "save", async function () { return this; });
  await controller.createDistributor({ body: { ...valid, website: "" } }, res);
  assert.equal(res.code, 201);
});

test("rejects invalid mobile, pincode and website", async () => {
  for (const [field, value, message] of [
    ["mobile", "12345", /mobile must be/],
    ["mobile", "5876543210", /mobile must be/],
    ["pincode", "41100", /pincode must be 6 digits/],
    ["pincode", "011001", /pincode must be 6 digits/],
    ["website", "not a site", /website must be/],
    ["website", "ftp://files.example.com", /website must be/],
  ]) {
    const res = response();
    await controller.createDistributor({ body: { ...valid, [field]: value } }, res);
    assert.equal(res.code, 400, `${field}=${value}`);
    assert.match(res.body.message, message);
  }
});

test("update can remove the logo and cleans it after saving", async () => {
  const doc = new Distributor({ ...valid, mobile: "9876543210", logo: { public_id: "samarth/distributors/old", url: "https://example.com/old.png" } });
  mock.method(Distributor, "findById", async () => doc);
  let saved = false;
  mock.method(doc, "save", async () => { saved = true; return doc; });
  const destroy = mock.method(cloudinary.uploader, "destroy", async () => { assert.ok(saved); });
  const res = response();
  await controller.updateDistributor({ params: { id }, body: { removeLogo: "true", city: "Pune City" } }, res);
  assert.equal(res.code, 200);
  assert.equal(doc.city, "Pune City");
  assert.equal(doc.logo?.public_id, undefined);
  assert.equal(destroy.mock.calls[0].arguments[0], "samarth/distributors/old");
});

test("delete removes the distributor and its logo", async () => {
  mock.method(Distributor, "findByIdAndDelete", async () => ({ logo: { public_id: "samarth/distributors/gone" } }));
  const destroy = mock.method(cloudinary.uploader, "destroy", async () => ({}));
  const res = response();
  await controller.deleteDistributor({ params: { id } }, res);
  assert.equal(res.code, 200);
  assert.equal(destroy.mock.calls[0].arguments[0], "samarth/distributors/gone");
});
