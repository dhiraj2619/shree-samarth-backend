const adRouter = require("express").Router();
const { withGif } = require("../config/multerConfig");
const { isAdminAuth } = require("../middlewares/auth.middleware");
const controller = require("../controllers/ad.controller");

const image = withGif.single("image");

adRouter.post("/add", isAdminAuth, image, controller.createAd);
adRouter.put("/update/:id", isAdminAuth, image, controller.updateAd);
adRouter.delete("/delete/:id", isAdminAuth, controller.deleteAd);
adRouter.get("/admin/get-all", isAdminAuth, controller.getAdminAds);
adRouter.get("/admin/get-by-id/:id", isAdminAuth, controller.getAdminAdById);
adRouter.get("/get-all", controller.getAllAds);
adRouter.get("/get-by-id/:id", controller.getAdById);

module.exports = { adRouter };
