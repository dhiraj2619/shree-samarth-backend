const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const config = require("../config/Config");

test("settings writes require admin auth", async () => {
  const previous = config.ADMIN_JWT_SECRET;
  config.ADMIN_JWT_SECRET = "test-only-secret";
  const app = require("../index");
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/settings`;
  try {
    const id = new mongoose.Types.ObjectId().toString();
    for (const [method, path] of [["PUT", "/profile"], ["POST", "/quote-slides/add"], ["PUT", `/quote-slides/update/${id}`], ["DELETE", `/quote-slides/delete/${id}`]]) {
      assert.equal((await fetch(base + path, { method })).status, 401, `${method} ${path}`);
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    config.ADMIN_JWT_SECRET = previous;
  }
});
