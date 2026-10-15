const mongoose = require("mongoose");

// Business profile shown on the website and app (a single document). Admin login is separate.
const adminInfoSchema = new mongoose.Schema(
  {
    companyName: { type: String, trim: true, default: "Samarth Enterprises" },
    ownerName: { type: String, trim: true, default: "Samarth Owner" },
    email: { type: String, trim: true, lowercase: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    whatsappNumber: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    gstNumber: { type: String, trim: true, default: "" },
    // Full URLs shown on the website and app. WhatsApp is a wa.me link.
    socialLinks: {
      instagram: { type: String, trim: true, default: "" },
      youtube: { type: String, trim: true, default: "" },
      whatsapp: { type: String, trim: true, default: "" },
    },
    maintenanceMode: { type: Boolean, default: false },
  },
  { timestamps: true },
);

module.exports = mongoose.model("AdminInfo", adminInfoSchema);
