const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
    thumbnail: {
      public_id: { type: String, trim: true },
      url: { type: String, trim: true },
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Category", categorySchema);
