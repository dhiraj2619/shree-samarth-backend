const {
  PORT,
  CLOUDINARY_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
} = require("./config/Config");

const express = require("express");
const cors = require("cors");
const cloudinary = require("cloudinary").v2;
const connectToDb = require("./dbconnection");
const { productRouter } = require("./routes/products.route");
const { categoryRouter } = require("./routes/categories.route");
const { referralRouter } = require("./routes/referrals.route");
const { adminRouter } = require("./routes/admin.route");
const { broadcastRouter } = require("./routes/broadcasts.route");
const { distributorRouter } = require("./routes/distributors.route");
const { offerRouter } = require("./routes/offers.route");
const { enquiryRouter } = require("./routes/enquiries.route");
const { settingsRouter } = require("./routes/settings.route");

cloudinary.config({
  cloud_name: CLOUDINARY_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

const app = express();
// Render runs the app behind a proxy; trust its X-Forwarded-For so req.ip is the visitor (used by rate limits).
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.get("/", (req, res) => {
  res.send(`<center><h1>Server is Started...</h1></center>`);
});

app.use("/api/v1/products", productRouter);
app.use("/api/v1/categories", categoryRouter);
app.use("/api/v1/referrals", referralRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/broadcasts", broadcastRouter);
app.use("/api/v1/distributors", distributorRouter);
app.use("/api/v1/offers", offerRouter);
app.use("/api/v1/enquiries", enquiryRouter);
app.use("/api/v1/settings", settingsRouter);


app.use((req, res) => res.status(404).json({ success: false, message: "Route not found" }));
app.use((error, req, res, next) => {
  const status = error.name === "MulterError" ? 400 : error.status || 500;
  res.status(status).json({ success: false, message: status >= 500 ? "Internal server error" : error.message });
});

if (require.main === module) {
  connectToDb().then(() => {
    const port = PORT || 5000;
    app.listen(port, () => console.log(`Samarth backend running on port ${port}`));
  }).catch((error) => {
    console.error("Server startup failed:", error.message);
    process.exitCode = 1;
  });
}

module.exports = app;
