const mongoose = require("mongoose");

// A bulk-purchase offer: a discount code customers can use on orders above a minimum amount.
const offerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, trim: true, default: "", maxlength: 1000 },
    // Stored upper-case; unique so a code always points to one offer.
    code: { type: String, required: true, trim: true, uppercase: true, unique: true, match: [/^[A-Z0-9_-]{3,30}$/, "code must be 3 to 30 letters, numbers, - or _"] },
    discountType: { type: String, enum: ["FLAT", "PERCENTAGE"], required: true },
    // Rupees for FLAT, percent (1 to 100) for PERCENTAGE.
    discountValue: { type: Number, required: true, min: 0 },
    minOrderAmount: { type: Number, min: 0, default: 0 },
    // Empty means the offer applies to every product.
    applicableProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
  },
  { timestamps: true },
);

offerSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Offer", offerSchema);
