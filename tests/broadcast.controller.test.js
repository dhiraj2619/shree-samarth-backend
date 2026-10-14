const { test, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;
const Broadcast = require("../models/broadcast.model");
const controller = require("../controllers/broadcast.controller");

afterEach(() => mock.restoreAll());
const id = new mongoose.Types.ObjectId().toString();
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } });
const gif = { buffer: Buffer.from("x"), mimetype: "image/gif" };

test("create broadcast with title, description, image and link", async () => {
  mock.method(Broadcast.prototype, "save", async function () { return this; });
  mock.method(cloudinary.uploader, "upload", async () => ({ public_id: "samarth/broadcasts/b1", secure_url: "https://example.com/b1.gif" }));
  const res = response();
  await controller.createBroadcast({ body: { title: "  Diwali offer ", description: "20% off on Nohar", link: "https://nohar.in/diwali" }, file: gif }, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.data.title, "Diwali offer");
  assert.equal(res.body.data.link, "https://nohar.in/diwali");
  assert.equal(res.body.data.image.public_id, "samarth/broadcasts/b1");
});

test("create requires title, description and an image", async () => {
  for (const [body, file, message] of [
    [{ description: "x" }, gif, /title is required/],
    [{ title: "x" }, gif, /description is required/],
    [{ title: "x", description: "y" }, undefined, /image is required/],
  ]) {
    const res = response();
    await controller.createBroadcast({ body, file }, res);
    assert.equal(res.code, 400);
    assert.match(res.body.message, message);
  }
});

test("link must be an http(s) URL when given", async () => {
  for (const bad of ["nohar.in", "javascript:alert(1)", "ftp://example.com"]) {
    const res = response();
    await controller.createBroadcast({ body: { title: "x", description: "y", link: bad }, file: gif }, res);
    assert.equal(res.code, 400, bad);
    assert.match(res.body.message, /link must be a valid URL/);
  }
});

test("update replaces the image and cleans the old one after saving", async () => {
  const doc = new Broadcast({ title: "Old", description: "d", image: { public_id: "samarth/broadcasts/old", url: "https://example.com/old.png" } });
  mock.method(Broadcast, "findById", async () => doc);
  let saved = false;
  mock.method(doc, "save", async () => { saved = true; return doc; });
  mock.method(cloudinary.uploader, "upload", async () => ({ public_id: "samarth/broadcasts/new", secure_url: "https://example.com/new.png" }));
  const destroy = mock.method(cloudinary.uploader, "destroy", async () => { assert.ok(saved); });
  const res = response();
  await controller.updateBroadcast({ params: { id }, body: { title: "New", link: "" }, file: gif }, res);
  assert.equal(res.code, 200);
  assert.equal(doc.title, "New");
  assert.equal(doc.image.public_id, "samarth/broadcasts/new");
  assert.equal(destroy.mock.calls[0].arguments[0], "samarth/broadcasts/old");
});

test("update without a new image keeps the current one", async () => {
  const doc = new Broadcast({ title: "T", description: "d", image: { public_id: "samarth/broadcasts/keep", url: "https://example.com/k.png" } });
  mock.method(Broadcast, "findById", async () => doc);
  mock.method(doc, "save", async () => doc);
  const destroy = mock.method(cloudinary.uploader, "destroy", async () => assert.fail("Should not delete"));
  const res = response();
  await controller.updateBroadcast({ params: { id }, body: { description: "Updated" } }, res);
  assert.equal(res.code, 200);
  assert.equal(doc.image.public_id, "samarth/broadcasts/keep");
  assert.equal(destroy.mock.callCount(), 0);
});

test("delete removes the broadcast and its image", async () => {
  mock.method(Broadcast, "findByIdAndDelete", async () => ({ image: { public_id: "samarth/broadcasts/gone" } }));
  const destroy = mock.method(cloudinary.uploader, "destroy", async () => ({}));
  const res = response();
  await controller.deleteBroadcast({ params: { id } }, res);
  assert.equal(res.code, 200);
  assert.equal(destroy.mock.calls[0].arguments[0], "samarth/broadcasts/gone");
  const missing = response();
  mock.method(Broadcast, "findByIdAndDelete", async () => null);
  await controller.deleteBroadcast({ params: { id } }, missing);
  assert.equal(missing.code, 404);
});
