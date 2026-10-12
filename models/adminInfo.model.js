const mongoose = require("mongoose");

// Business/contact settings; admin authentication is separate, as in Nohar.
const adminInfoSchema = new mongoose.Schema(
  {
    ownerName: { type: String, trim: true, default: "Samarth Owner" },
    email: { type: String, trim: true, lowercase: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    whatsappNumber: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    gstNumber: { type: String, trim: true, default: "" },
    maintenanceMode: { type: Boolean, default: false },
  },
  { timestamps: true },
);

module.exports = mongoose.model("AdminInfo", adminInfoSchema);
