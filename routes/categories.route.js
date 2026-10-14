const categoryRouter = require("express").Router();
const upload = require("../config/multerConfig");
const { isAdminAuth } = require("../middlewares/auth.middleware");
const controller = require("../controllers/category.controller");

const thumbnail = upload.single("thumbnail");

categoryRouter.post("/add", isAdminAuth, thumbnail, controller.createCategory);
categoryRouter.put("/update/:id", isAdminAuth, thumbnail, controller.updateCategory);
categoryRouter.delete("/delete/:id", isAdminAuth, controller.deleteCategory);
categoryRouter.get("/admin/get-all", isAdminAuth, controller.getAdminCategories);
categoryRouter.get("/admin/get-by-id/:id", isAdminAuth, controller.getAdminCategoryById);
categoryRouter.get("/get-all", controller.getAllCategories);
categoryRouter.get("/get-by-id/:id", controller.getCategoryById);

module.exports = { categoryRouter };
