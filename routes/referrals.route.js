const referralRouter = require("express").Router();
const { isAdminAuth } = require("../middlewares/auth.middleware");
const controller = require("../controllers/referral.controller");

// Public: used by the catalogue's "Buy now" / "Bulk purchase" buttons.
referralRouter.post("/track", controller.trackReferral);
referralRouter.get("/go/:productId", controller.goToNohar);

referralRouter.post("/admin/add", isAdminAuth, controller.createReferral);
referralRouter.put("/update/:id", isAdminAuth, controller.updateReferral);
referralRouter.delete("/delete/:id", isAdminAuth, controller.deleteReferral);
referralRouter.get("/admin/get-all", isAdminAuth, controller.listReferrals);
referralRouter.get("/admin/summary", isAdminAuth, controller.getSummary);

module.exports = { referralRouter };
