const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const config = require("../config/Config");

const TOKEN_TTL = "7d";
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const failures = new Map();

// Compare via fixed-length digests so neither length nor content leaks through timing.
const safeEqual = (a, b) => crypto.timingSafeEqual(
  crypto.createHash("sha256").update(String(a)).digest(),
  crypto.createHash("sha256").update(String(b)).digest(),
);

// ADMIN_PASSWORD may be plain text or a bcrypt hash ($2a$/$2b$...).
const passwordMatches = async (password, expected) => (
  /^\$2[aby]\$/.test(expected) ? bcrypt.compare(password, expected) : safeEqual(password, expected)
);

const login = async (req, res) => {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_JWT_SECRET, ADMIN_NAME } = config;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_JWT_SECRET) {
    return res.status(503).json({ success: false, message: "Admin login is not configured" });
  }
  const key = req.ip || "unknown";
  const now = Date.now();
  const record = failures.get(key);
  if (record && now - record.first < WINDOW_MS && record.count >= MAX_FAILURES) {
    return res.status(429).json({ success: false, message: "Too many failed attempts. Try again in 15 minutes." });
  }
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required" });
  }
  const emailOk = safeEqual(email.trim().toLowerCase(), ADMIN_EMAIL.trim().toLowerCase());
  const passwordOk = await passwordMatches(password, ADMIN_PASSWORD);
  if (!emailOk || !passwordOk) {
    const fresh = !record || now - record.first >= WINDOW_MS;
    failures.set(key, { first: fresh ? now : record.first, count: fresh ? 1 : record.count + 1 });
    return res.status(401).json({ success: false, message: "Invalid email or password" });
  }
  failures.delete(key);
  const admin = { name: ADMIN_NAME || "Samarth Admin", email: ADMIN_EMAIL };
  const token = jwt.sign({ role: "owner", ...admin }, ADMIN_JWT_SECRET, { algorithm: "HS256", expiresIn: TOKEN_TTL });
  return res.status(200).json({ success: true, message: "Logged in successfully", data: { token, admin } });
};

const me = (req, res) => res.status(200).json({
  success: true,
  message: "Admin session is valid",
  data: { name: req.admin.name || "Samarth Admin", email: req.admin.email || "" },
});

const resetLoginLimits = () => failures.clear();

module.exports = { login, me, resetLoginLimits };
