const mongoose = require("mongoose");

const collectionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    thumbnail: {
      public_id: { type: String, trim: true },
      url: { type: String, trim: true },
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Collection", collectionSchema);
