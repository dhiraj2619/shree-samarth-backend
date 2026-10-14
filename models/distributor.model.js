const mongoose = require("mongoose");

const distributorSchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true, trim: true, maxlength: 150 },
    logo: {
      public_id: { type: String, trim: true },
      url: { type: String, trim: true },
    },
    contactPerson: { type: String, required: true, trim: true, maxlength: 100 },
    // Stored as 10 digits (Indian mobile number without +91).
    mobile: { type: String, required: true, trim: true, match: [/^[6-9]\d{9}$/, "mobile must be a valid 10-digit Indian mobile number"] },
    website: { type: String, trim: true, default: "" },
    pincode: { type: String, required: true, trim: true, match: [/^[1-9]\d{5}$/, "pincode must be 6 digits"] },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    state: { type: String, required: true, trim: true, maxlength: 100 },
  },
  { timestamps: true },
);

distributorSchema.index({ createdAt: -1 });
distributorSchema.index({ pincode: 1 });

module.exports = mongoose.model("Distributor", distributorSchema);
