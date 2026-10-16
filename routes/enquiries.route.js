const enquiryRouter = require("express").Router();
const { isAdminAuth } = require("../middlewares/auth.middleware");
const controller = require("../controllers/enquiry.controller");

// Public: the website's Contact us form posts here (JSON: name, phone, email?, city?, state?, pincode?, message, productId?).
enquiryRouter.post("/submit", controller.submitEnquiry);

enquiryRouter.get("/admin/get-all", isAdminAuth, controller.listEnquiries);
enquiryRouter.put("/update/:id", isAdminAuth, controller.updateEnquiry);
enquiryRouter.delete("/delete/:id", isAdminAuth, controller.deleteEnquiry);

module.exports = { enquiryRouter };
