const mongoose = require("mongoose");

const mediaSchema = new mongoose.Schema(
  {
    public_id: {
      type: String,
      default: null,
    },
    url: {
      type: String,
      default: null,
    },
  },
  { _id: false },
);

const adSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    videoLink: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
    image: {
      type: mediaSchema,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

const Ad = mongoose.model("Ad", adSchema);

module.exports = Ad;
