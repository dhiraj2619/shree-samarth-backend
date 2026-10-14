const { test, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Product = require("../models/products.model");
const config = require("../config/Config");

afterEach(() => mock.restoreAll());

test("routes enforce admin auth before parsing uploads and expose public reads", async () => {
  const previous = config.ADMIN_JWT_SECRET;
  config.ADMIN_JWT_SECRET = "test-only-secret";
  const app = require("../index");
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/products`;
  try {
    const id = new mongoose.Types.ObjectId().toString();
    for (const [method, path] of [["POST", "/add"], ["PUT", `/update/${id}`], ["DELETE", `/delete/${id}`], ["GET", "/admin/get-all"]]) {
      assert.equal((await fetch(base + path, { method })).status, 401);
    }
    const wrongRole = jwt.sign({ role: "customer" }, config.ADMIN_JWT_SECRET);
    assert.equal((await fetch(base + "/add", { method: "POST", headers: { authorization: `Bearer ${wrongRole}` } })).status, 403);
    assert.equal((await fetch(base + "/get-by-id/invalid")).status, 400);
    assert.equal((await fetch(base + "/get-by-category/invalid")).status, 400);
    mock.method(Product, "findByIdAndDelete", async () => null);
    const owner = jwt.sign({ role: "owner" }, config.ADMIN_JWT_SECRET);
    assert.equal((await fetch(base + `/delete/${id}`, { method: "DELETE", headers: { authorization: `Bearer ${owner}` } })).status, 404);
    const form = new FormData();
    form.append("images", new Blob(["invalid"], { type: "text/plain" }), "bad.txt");
    const invalidImage = await fetch(base + "/add", { method: "POST", headers: { authorization: `Bearer ${owner}` }, body: form });
    assert.equal(invalidImage.status, 400);
    assert.match((await invalidImage.json()).message, /JPEG/);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    config.ADMIN_JWT_SECRET = previous;
  }
});
