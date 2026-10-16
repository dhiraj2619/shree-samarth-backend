const mongoose = require("mongoose");

// Guest enquiries do not require a customer account or cart.
const leadSchema = new mongoose.Schema(
  {
    leadType: {
      type: String,
      enum: ["PRODUCT_ENQUIRY", "GENERAL_ENQUIRY", "WHATSAPP_LEAD"],
      default: "GENERAL_ENQUIRY",
    },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    customerName: { type: String, required: true, trim: true },
    contact: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: "" },
    city: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    pincode: { type: String, trim: true, default: "" },
    enquiry: { type: String, required: true, trim: true },
    source: {
      type: String,
      enum: ["web", "admin", "unknown"],
      default: "web",
    },
    status: {
      type: String,
      enum: ["NEW", "CONTACTED", "CLOSED"],
      default: "NEW",
    },
  },
  { timestamps: true },
);

leadSchema.index({ leadType: 1, createdAt: -1 });
leadSchema.index({ contact: 1 });

module.exports = mongoose.model("Lead", leadSchema);
