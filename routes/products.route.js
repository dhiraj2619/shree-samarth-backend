const productRouter = require("express").Router();
const upload = require("../config/multerConfig");
const { isAdminAuth } = require("../middlewares/auth.middleware");
const controller = require("../controllers/product.controller");

const productImages = upload.fields([
  { name: "images", maxCount: 10 },
  { name: "guideImage", maxCount: 1 },
]);

productRouter.post("/add", isAdminAuth, productImages, controller.createProduct);
productRouter.put("/update/:id", isAdminAuth, productImages, controller.updateProduct);
productRouter.delete("/delete/:id", isAdminAuth, controller.deleteProduct);
productRouter.get("/admin/get-all", isAdminAuth, controller.getAdminProducts);
productRouter.get("/admin/get-by-id/:id", isAdminAuth, controller.getAdminProductById);
productRouter.get("/get-all", controller.getAllProducts);
productRouter.get("/featured", controller.getFeaturedProducts);
productRouter.get("/most-buy", controller.getMostBuyProducts);
productRouter.get("/get-by-category/:categoryId", controller.getProductsByCategories);
productRouter.get("/get-by-id/:id", controller.getProductById);

module.exports = { productRouter };
