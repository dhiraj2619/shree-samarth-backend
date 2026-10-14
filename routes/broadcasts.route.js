const broadcastRouter = require("express").Router();
const { withGif } = require("../config/multerConfig");
const { isAdminAuth } = require("../middlewares/auth.middleware");
const controller = require("../controllers/broadcast.controller");

const image = withGif.single("image");

broadcastRouter.post("/add", isAdminAuth, image, controller.createBroadcast);
broadcastRouter.put("/update/:id", isAdminAuth, image, controller.updateBroadcast);
broadcastRouter.delete("/delete/:id", isAdminAuth, controller.deleteBroadcast);
broadcastRouter.get("/admin/get-all", isAdminAuth, controller.getAdminBroadcasts);
broadcastRouter.get("/get-all", controller.getAllBroadcasts);
broadcastRouter.get("/get-by-id/:id", controller.getBroadcastById);

module.exports = { broadcastRouter };
