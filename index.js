require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cloudinary = require("cloudinary").v2;
const connectToDb = require("./dbconnection");
const { productRouter } = require("./routes/products.route");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.get("/", (req, res) => res.json({ success: true, message: "Samarth catalogue backend" }));
app.use("/api/v1/products", productRouter);
app.use((req, res) => res.status(404).json({ success: false, message: "Route not found" }));
app.use((error, req, res, next) => {
  const status = error.name === "MulterError" ? 400 : error.status || 500;
  res.status(status).json({ success: false, message: status >= 500 ? "Internal server error" : error.message });
});

if (require.main === module) {
  connectToDb().then(() => {
    const port = process.env.PORT || 5000;
    app.listen(port, () => console.log(`Samarth backend running on port ${port}`));
  }).catch((error) => {
    console.error("Server startup failed:", error.message);
    process.exitCode = 1;
  });
}

module.exports = app;
