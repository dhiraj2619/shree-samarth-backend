const mongoose = require("mongoose");
const { MONGO_URI } = require("./config/Config");

module.exports = async () => {
  if (!MONGO_URI) throw new Error("MONGO_URI is required");
  await mongoose.connect(MONGO_URI);
  console.log("Connected to Samarth database");
};
