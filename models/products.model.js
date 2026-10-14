const mongoose = require("mongoose");

const mediaSchema = new mongoose.Schema(
  {
    public_id: { type: String, trim: true },
    url: { type: String, trim: true },
  },
  { _id: false },
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    // Samarth is a catalogue: no price is stored. Sales happen on nohar.in.
    images: {
      type: [mediaSchema],
      default: [],
      validate: { validator: (images) => images.length <= 10, message: "A product can have at most 10 images" },
    },
    guideImage: { type: mediaSchema, default: null },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    ratings: { type: Number, min: 0, max: 5, default: null },
    rewardPoints: { type: Number, min: 0, default: 0 },
    inStock: { type: Boolean, default: true },
    isMostBuy: { type: Boolean, default: false },
    hsnCode: { type: String, trim: true, default: "", match: [/^(\d{4,8})?$/, "hsnCode must be 4 to 8 digits"] },
    gstRate: { type: Number, enum: [0, 5, 12, 18, 28], default: 5 },
    // Where the catalogue's "Buy now" and "Bulk purchase" buttons send visitors.
    buyNowUrl: { type: String, trim: true, default: "" },
    bulkPurchaseUrl: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    seo: {
      titleTag: { type: String, trim: true, default: "" },
      metaDescription: { type: String, trim: true, default: "" },
      keywords: { type: String, trim: true, default: "" },
      canonicalUrl: { type: String, trim: true, default: "" },
      metaRobots: { type: String, trim: true, default: "index, follow" },
    },
    socialShare: {
      ogTitle: { type: String, trim: true, default: "" },
      ogDescription: { type: String, trim: true, default: "" },
      ogImageUrl: { type: String, trim: true, default: "" },
      ogType: { type: String, trim: true, default: "product" },
      twitterTitle: { type: String, trim: true, default: "" },
      twitterDescription: { type: String, trim: true, default: "" },
      twitterImageUrl: { type: String, trim: true, default: "" },
    },
  },
  { timestamps: true },
);

productSchema.index({ categoryId: 1, isActive: 1 });
productSchema.index({ isFeatured: 1, isActive: 1 });
productSchema.index({ isMostBuy: 1, isActive: 1 });
productSchema.index({ inStock: 1 });

module.exports = mongoose.model("Product", productSchema);
