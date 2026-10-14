const mongoose = require("mongoose");

// One click on a product's "Buy now" or "Bulk purchase" button that sent a visitor to nohar.in.
// The sale happens on Nohar; the outcome and order value are recorded here afterwards.
const referralSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    // Snapshot so the record still reads correctly if the product is renamed or deleted.
    productName: { type: String, required: true, trim: true },
    type: { type: String, enum: ["buy", "bulk"], required: true },
    quantity: { type: Number, min: 1, default: 1 },
    redirectUrl: { type: String, trim: true, default: "" },
    redirectedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ["REDIRECTED", "CONVERTED", "NOT_CONVERTED"], default: "REDIRECTED" },
    orderValue: { type: Number, min: 0, default: null },
    noharOrderId: { type: String, trim: true, default: "" },
    source: { type: String, enum: ["web", "admin"], default: "web" },
  },
  { timestamps: true },
);

referralSchema.index({ redirectedAt: -1 });
referralSchema.index({ status: 1, redirectedAt: -1 });
referralSchema.index({ product: 1, redirectedAt: -1 });

module.exports = mongoose.model("Referral", referralSchema);
