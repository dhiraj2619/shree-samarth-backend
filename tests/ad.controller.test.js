const { test, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;
const Ad = require("../models/ads.model");
const controller = require("../controllers/ad.controller");
afterEach(() => mock.restoreAll());
const id = new mongoose.Types.ObjectId().toString();
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test("ads accept title, optional media, and false active status", async () => {
  mock.method(Ad.prototype, "save", async function () { return this; });
  const res = response();
  await controller.createAd({ body: { title: " Campaign ", videoLink: "https://youtu.be/abcdefghijk", isActive: "false" } }, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.data.title, "Campaign");
  assert.equal(res.body.data.isActive, false);
  assert.equal(res.body.data.image, null);
});

test("ads reject missing title, unsafe URLs, and malformed status", async () => {
  for (const body of [{}, { title: " " }, { title: "Ad", videoLink: "javascript:alert(1)" }, { title: "Ad", isActive: "yes" }]) {
    const res = response();
    await controller.createAd({ body }, res);
    assert.equal(res.code, 400);
  }
});

test("ad update preserves omitted fields and deletes replaced image only after save", async () => {
  const ad = new Ad({ title: "Old", videoLink: "https://example.com/video.mp4", image: { public_id: "samarth/ads/old", url: "https://example.com/old.png" } });
  mock.method(Ad, "findById", async () => ad);
  let saved = false;
  mock.method(ad, "save", async () => { saved = true; return ad; });
  mock.method(cloudinary.uploader, "upload", async () => ({ public_id: "samarth/ads/new", secure_url: "https://example.com/new.png" }));
  const destroy = mock.method(cloudinary.uploader, "destroy", async () => { assert.equal(saved, true); });
  const res = response();
  await controller.updateAd({ params: { id }, body: { title: "New" }, file: { buffer: Buffer.from("image"), mimetype: "image/png" } }, res);
  assert.equal(res.code, 200);
  assert.equal(ad.videoLink, "https://example.com/video.mp4");
  assert.equal(destroy.mock.calls[0].arguments[0], "samarth/ads/old");
});

test("failed save removes new upload without deleting old image", async () => {
  const ad = new Ad({ title: "Ad", image: { public_id: "samarth/ads/old", url: "https://example.com/old.png" } });
  mock.method(Ad, "findById", async () => ad);
  mock.method(ad, "save", async () => { const error = new Error("Validation failed"); error.name = "ValidationError"; throw error; });
  mock.method(cloudinary.uploader, "upload", async () => ({ public_id: "samarth/ads/new", secure_url: "https://example.com/new.png" }));
  const destroy = mock.method(cloudinary.uploader, "destroy", async () => ({}));
  const res = response();
  await controller.updateAd({ params: { id }, body: {}, file: { buffer: Buffer.from("image"), mimetype: "image/png" } }, res);
  assert.equal(res.code, 400);
  assert.deepEqual(destroy.mock.calls.map(call => call.arguments[0]), ["samarth/ads/new"]);
});

test("public lists enforce active status; admin filters can include drafts", async () => {
  const filters = [];
  const query = { sort() { return this; }, skip() { return this; }, limit() { return this; }, lean: async () => [] };
  mock.method(Ad, "find", filter => { filters.push(filter); return query; });
  mock.method(Ad, "countDocuments", async () => 0);
  const res = response();
  await controller.getAllAds({ query: { isActive: "false", search: ".*" } }, res);
  assert.equal(res.code, 200);
  assert.equal(filters[0].isActive, true);
  assert.equal(filters[0].title.$regex, "\\.\\*");
  await controller.getAdminAds({ query: { isActive: "false" } }, response());
  assert.equal(filters[1].isActive, false);
});

test("public details hide inactive ads and invalid IDs fail", async () => {
  mock.method(Ad, "findOne", filter => { assert.equal(filter.isActive, true); return { lean: async () => null }; });
  const res = response();
  await controller.getAdById({ params: { id } }, res);
  assert.equal(res.code, 404);
  const invalid = response();
  await controller.deleteAd({ params: { id: "bad" } }, invalid);
  assert.equal(invalid.code, 400);
});

test("removing an ad image preserves the ad", async () => {
  const ad = new Ad({ title: "Keep", image: { public_id: "samarth/ads/old" } });
  mock.method(Ad, "findById", async () => ad);
  mock.method(ad, "save", async () => ad);
  const destroy = mock.method(cloudinary.uploader, "destroy", async () => ({}));
  const res = response();
  await controller.updateAd({ params: { id }, body: { removeImage: "true" } }, res);
  assert.equal(res.code, 200);
  assert.equal(ad.image, null);
  assert.equal(destroy.mock.callCount(), 1);
});

test("ad routes protect mutations and admin reads", async () => {
  const express = require("express");
  const { adRouter } = require("../routes/ads.route");
  const app = express();
  app.use(adRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try {
    for (const [method, path] of [["POST", "/add"], ["PUT", `/update/${id}`], ["DELETE", `/delete/${id}`], ["GET", "/admin/get-all"], ["GET", `/admin/get-by-id/${id}`]]) {
      const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method });
      assert.ok([401, 503].includes(res.status), `${method} ${path}: ${res.status}`);
    }
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
