const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const config = require("../config/Config");

test("enquiry admin routes require admin auth", async () => {
  const previous = config.ADMIN_JWT_SECRET;
  config.ADMIN_JWT_SECRET = "test-only-secret";
  const app = require("../index");
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/enquiries`;
  try {
    const id = new mongoose.Types.ObjectId().toString();
    for (const [method, path] of [["GET", "/admin/get-all"], ["PUT", `/update/${id}`], ["DELETE", `/delete/${id}`]]) {
      assert.equal((await fetch(base + path, { method })).status, 401, `${method} ${path}`);
    }
    const invalid = await fetch(base + "/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "", phone: "", message: "" }) });
    assert.equal(invalid.status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    config.ADMIN_JWT_SECRET = previous;
  }
});
