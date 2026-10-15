const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const config = require("../config/Config");

test("offer routes require admin auth for writes and admin reads", async () => {
  const previous = config.ADMIN_JWT_SECRET;
  config.ADMIN_JWT_SECRET = "test-only-secret";
  const app = require("../index");
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/offers`;
  try {
    const id = new mongoose.Types.ObjectId().toString();
    for (const [method, path] of [["POST", "/add"], ["PUT", `/update/${id}`], ["DELETE", `/delete/${id}`], ["GET", "/admin/get-all"]]) {
      assert.equal((await fetch(base + path, { method })).status, 401, `${method} ${path}`);
    }
    assert.equal((await fetch(base + "/get-by-id/invalid")).status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    config.ADMIN_JWT_SECRET = previous;
  }
});
