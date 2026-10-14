const jwt = require("jsonwebtoken");
const { ADMIN_JWT_SECRET } = require("../config/Config");

const isAdminAuth = (req, res, next) => {
  if (!ADMIN_JWT_SECRET) {
    return res.status(503).json({ success: false, message: "Admin authentication is not configured" });
  }
  const token = req.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) {
    return res.status(401).json({ success: false, message: "Admin token is required" });
  }
  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET, { algorithms: ["HS256"] });
    if (decoded.role !== "owner") {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }
    req.admin = decoded;
    return next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired admin token" });
  }
};

module.exports = { isAdminAuth };
