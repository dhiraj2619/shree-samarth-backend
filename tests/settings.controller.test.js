const { test, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;
const AdminInfo = require("../models/adminInfo.model");
const QuoteSlider = require("../models/quoteslider.model");
const controller = require("../controllers/settings.controller");

afterEach(() => mock.restoreAll());
const id = new mongoose.Types.ObjectId().toString();
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } });
const png = { buffer: Buffer.from("x"), mimetype: "image/png" };

const withProfile = (doc = new AdminInfo()) => {
  mock.method(AdminInfo, "findOne", async () => doc);
  mock.method(doc, "save", async () => doc);
  return doc;
};

test("profile update normalises phone, email, GST and social links", async () => {
  const doc = withProfile();
  const res = response();
  await controller.updateProfile({ body: {
    companyName: " Samarth Enterprises ", ownerName: "Ravi Patil", phone: "+91 98765-43210", email: "Owner@Samarth.in", gstNumber: "27caapb9203j2zx",
    socialLinks: { instagram: "instagram.com/samarth", youtube: "https://youtu.be/abc", whatsapp: "98765 43210" },
  } }, res);
  assert.equal(res.code, 200);
  assert.equal(doc.companyName, "Samarth Enterprises");
  assert.equal(doc.phone, "9876543210");
  assert.equal(doc.email, "owner@samarth.in");
  assert.equal(doc.gstNumber, "27CAAPB9203J2ZX");
  assert.equal(doc.socialLinks.instagram, "https://instagram.com/samarth");
  assert.equal(doc.socialLinks.youtube, "https://youtu.be/abc");
  assert.equal(doc.socialLinks.whatsapp, "https://wa.me/919876543210");
});

test("profile fields can be cleared, except company and owner name", async () => {
  const doc = withProfile(new AdminInfo({ phone: "9876543210", socialLinks: { instagram: "https://instagram.com/x" } }));
  const res = response();
  await controller.updateProfile({ body: { phone: "", socialLinks: { instagram: "" } } }, res);
  assert.equal(res.code, 200);
  assert.equal(doc.phone, "");
  assert.equal(doc.socialLinks.instagram, "");
  const bad = response();
  await controller.updateProfile({ body: { companyName: " " } }, bad);
  assert.equal(bad.code, 400);
});

test("profile rejects invalid values and links to the wrong site", async () => {
  withProfile();
  for (const [body, message] of [
    [{ phone: "12345" }, /phone must be/],
    [{ email: "nope" }, /email must be/],
    [{ gstNumber: "ABC" }, /GSTIN/],
    [{ socialLinks: { instagram: "https://facebook.com/samarth" } }, /instagram.com link/],
    [{ socialLinks: { youtube: "javascript:alert(1)" } }, /youtube must be a valid link/],
    [{ socialLinks: { whatsapp: "12345" } }, /whatsapp must be/],
  ]) {
    const res = response();
    await controller.updateProfile({ body }, res);
    assert.equal(res.code, 400, JSON.stringify(body));
    assert.match(res.body.message, message);
  }
});

test("adding a quote slide needs an image and respects the limit", async () => {
  const missing = response();
  await controller.addQuoteSlide({}, missing);
  assert.equal(missing.code, 400);
  mock.method(QuoteSlider, "countDocuments", async () => 10);
  const full = response();
  await controller.addQuoteSlide({ file: png }, full);
  assert.equal(full.code, 400);
  assert.match(full.body.message, /at most 10/);
});

test("adding a quote slide uploads the image", async () => {
  mock.method(QuoteSlider, "countDocuments", async () => 2);
  mock.method(cloudinary.uploader, "upload", async () => ({ public_id: "samarth/quote-slides/s1", secure_url: "https://example.com/s1.png" }));
  mock.method(QuoteSlider, "create", async (doc) => ({ _id: id, ...doc }));
  const res = response();
  await controller.addQuoteSlide({ file: png }, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.data.image.public_id, "samarth/quote-slides/s1");
});

test("replacing a slide image removes the old one after saving", async () => {
  const doc = new QuoteSlider({ image: { public_id: "samarth/quote-slides/old", url: "https://example.com/old.png" } });
  mock.method(QuoteSlider, "findById", async () => doc);
  let saved = false;
  mock.method(doc, "save", async () => { saved = true; return doc; });
  mock.method(cloudinary.uploader, "upload", async () => ({ public_id: "samarth/quote-slides/new", secure_url: "https://example.com/new.png" }));
  const destroy = mock.method(cloudinary.uploader, "destroy", async () => { assert.ok(saved); });
  const res = response();
  await controller.updateQuoteSlide({ params: { id }, file: png }, res);
  assert.equal(res.code, 200);
  assert.equal(doc.image.public_id, "samarth/quote-slides/new");
  assert.equal(destroy.mock.calls[0].arguments[0], "samarth/quote-slides/old");
});

test("deleting a slide removes its image", async () => {
  mock.method(QuoteSlider, "findByIdAndDelete", async () => ({ image: { public_id: "samarth/quote-slides/gone" } }));
  const destroy = mock.method(cloudinary.uploader, "destroy", async () => ({}));
  const res = response();
  await controller.deleteQuoteSlide({ params: { id } }, res);
  assert.equal(res.code, 200);
  assert.equal(destroy.mock.calls[0].arguments[0], "samarth/quote-slides/gone");
});
