const distributorRouter = require("express").Router();
const upload = require("../config/multerConfig");
const { isAdminAuth } = require("../middlewares/auth.middleware");
const controller = require("../controllers/distributor.controller");

const logo = upload.single("logo");

distributorRouter.post("/add", isAdminAuth, logo, controller.createDistributor);
distributorRouter.put("/update/:id", isAdminAuth, logo, controller.updateDistributor);
distributorRouter.delete("/delete/:id", isAdminAuth, controller.deleteDistributor);
distributorRouter.get("/admin/get-all", isAdminAuth, controller.getAdminDistributors);
// Public: lets the website list distributors (e.g. a "find a distributor" page).
distributorRouter.get("/get-all", controller.getAllDistributors);
distributorRouter.get("/get-by-id/:id", controller.getDistributorById);

module.exports = { distributorRouter };
