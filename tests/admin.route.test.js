const { test } = require("node:test");
const assert = require("node:assert/strict");
const config = require("../config/Config");

test("login issues a token that unlocks admin routes", async () => {
  const saved = { ...config };
  Object.assign(config, { ADMIN_EMAIL: "owner@samarth.test", ADMIN_PASSWORD: "pw-for-tests", ADMIN_JWT_SECRET: "test-only-secret", ADMIN_NAME: "Owner" });
  const app = require("../index");
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    const post = (body) => fetch(`${base}/admin/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await post({ email: "owner@samarth.test", password: "wrong" })).status, 401);
    const ok = await post({ email: "owner@samarth.test", password: "pw-for-tests" });
    assert.equal(ok.status, 200);
    const { data } = await ok.json();
    const me = await fetch(`${base}/admin/me`, { headers: { authorization: `Bearer ${data.token}` } });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).data.email, "owner@samarth.test");
    assert.equal((await fetch(`${base}/admin/me`)).status, 401);
    assert.equal((await fetch(`${base}/referrals/admin/summary`)).status, 401);
    assert.equal((await fetch(`${base}/referrals/track`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: "bad", type: "buy" }) })).status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    Object.assign(config, saved);
  }
});
