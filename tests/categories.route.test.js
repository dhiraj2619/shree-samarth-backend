const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const config = require("../config/Config");

test("category routes require admin auth for writes and admin reads", async () => {
  const previous = config.ADMIN_JWT_SECRET;
  config.ADMIN_JWT_SECRET = "test-only-secret";
  const app = require("../index");
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/categories`;
  try {
    const id = new mongoose.Types.ObjectId().toString();
    for (const [method, path] of [["POST", "/add"], ["PUT", `/update/${id}`], ["DELETE", `/delete/${id}`], ["GET", "/admin/get-all"], ["GET", `/admin/get-by-id/${id}`]]) {
      assert.equal((await fetch(base + path, { method })).status, 401, `${method} ${path}`);
    }
    const customer = jwt.sign({ role: "customer" }, config.ADMIN_JWT_SECRET);
    assert.equal((await fetch(base + "/add", { method: "POST", headers: { authorization: `Bearer ${customer}` } })).status, 403);
    assert.equal((await fetch(base + "/get-by-id/invalid")).status, 400);
    const owner = jwt.sign({ role: "owner" }, config.ADMIN_JWT_SECRET);
    const form = new FormData();
    form.append("thumbnail", new Blob(["invalid"], { type: "text/plain" }), "bad.txt");
    const invalid = await fetch(base + "/add", { method: "POST", headers: { authorization: `Bearer ${owner}` }, body: form });
    assert.equal(invalid.status, 400);
    assert.match((await invalid.json()).message, /JPEG/);
    assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/v1/collections/get-all`)).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    config.ADMIN_JWT_SECRET = previous;
  }
});
