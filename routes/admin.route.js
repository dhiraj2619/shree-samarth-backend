const adminRouter = require("express").Router();
const { isAdminAuth } = require("../middlewares/auth.middleware");
const controller = require("../controllers/admin.controller");

adminRouter.post("/login", controller.login);
adminRouter.get("/me", isAdminAuth, controller.me);

module.exports = { adminRouter };
