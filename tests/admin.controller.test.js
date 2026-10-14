const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const config = require("../config/Config");
const controller = require("../controllers/admin.controller");

const saved = {};
const keys = ["ADMIN_EMAIL", "ADMIN_PASSWORD", "ADMIN_JWT_SECRET", "ADMIN_NAME"];
beforeEach(() => {
  for (const key of keys) saved[key] = config[key];
  Object.assign(config, { ADMIN_EMAIL: "Owner@Samarth.test", ADMIN_PASSWORD: "correct horse", ADMIN_JWT_SECRET: "test-only-secret", ADMIN_NAME: "Owner" });
  controller.resetLoginLimits();
});
afterEach(() => Object.assign(config, saved));
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } });
const login = async (body, ip = "1.1.1.1") => { const res = response(); await controller.login({ body, ip }, res); return res; };

test("valid login returns an owner token (email is case-insensitive)", async () => {
  const res = await login({ email: " owner@samarth.test ", password: "correct horse" });
  assert.equal(res.code, 200);
  const decoded = jwt.verify(res.body.data.token, "test-only-secret", { algorithms: ["HS256"] });
  assert.equal(decoded.role, "owner");
  assert.equal(res.body.data.admin.name, "Owner");
  assert.equal(res.body.data.admin.password, undefined);
});

test("wrong credentials and missing fields are rejected", async () => {
  assert.equal((await login({ email: "owner@samarth.test", password: "wrong" })).code, 401);
  assert.equal((await login({ email: "someone@else.test", password: "correct horse" })).code, 401);
  assert.equal((await login({ email: "owner@samarth.test" })).code, 400);
  assert.equal((await login({ email: ["x"], password: "correct horse" })).code, 400);
});

test("bcrypt-hashed ADMIN_PASSWORD is supported", async () => {
  config.ADMIN_PASSWORD = await bcrypt.hash("hashed secret", 4);
  assert.equal((await login({ email: "owner@samarth.test", password: "hashed secret" })).code, 200);
  assert.equal((await login({ email: "owner@samarth.test", password: config.ADMIN_PASSWORD })).code, 401);
});

test("repeated failures from one address are throttled", async () => {
  for (let i = 0; i < 5; i++) await login({ email: "owner@samarth.test", password: "nope" });
  assert.equal((await login({ email: "owner@samarth.test", password: "correct horse" })).code, 429);
  assert.equal((await login({ email: "owner@samarth.test", password: "correct horse" }, "2.2.2.2")).code, 200);
});

test("login reports 503 when not configured", async () => {
  config.ADMIN_PASSWORD = "";
  assert.equal((await login({ email: "owner@samarth.test", password: "x" })).code, 503);
});
