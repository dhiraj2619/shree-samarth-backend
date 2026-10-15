const settingsRouter = require("express").Router();
const upload = require("../config/multerConfig");
const { isAdminAuth } = require("../middlewares/auth.middleware");
const controller = require("../controllers/settings.controller");

const image = upload.single("image");

// Public: business profile and quote slides for the website and app.
settingsRouter.get("/get", controller.getSettings);
settingsRouter.get("/quote-slides", controller.getQuoteSlides);

settingsRouter.put("/profile", isAdminAuth, controller.updateProfile);
settingsRouter.post("/quote-slides/add", isAdminAuth, image, controller.addQuoteSlide);
settingsRouter.put("/quote-slides/update/:id", isAdminAuth, image, controller.updateQuoteSlide);
settingsRouter.delete("/quote-slides/delete/:id", isAdminAuth, controller.deleteQuoteSlide);

module.exports = { settingsRouter };
