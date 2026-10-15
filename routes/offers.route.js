const offerRouter = require("express").Router();
const { isAdminAuth } = require("../middlewares/auth.middleware");
const controller = require("../controllers/offer.controller");

// Bulk-purchase offers. Bodies are JSON (no file uploads).
offerRouter.post("/add", isAdminAuth, controller.createOffer);
offerRouter.put("/update/:id", isAdminAuth, controller.updateOffer);
offerRouter.delete("/delete/:id", isAdminAuth, controller.deleteOffer);
offerRouter.get("/admin/get-all", isAdminAuth, controller.getAdminOffers);
offerRouter.get("/get-all", controller.getAllOffers);
offerRouter.get("/get-by-code/:code", controller.getOfferByCode);
offerRouter.get("/get-by-id/:id", controller.getOfferById);

module.exports = { offerRouter };
