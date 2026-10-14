const mongoose = require("mongoose");

const broadcastSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    image: {
      public_id: { type: String, trim: true },
      url: { type: String, trim: true },
    },
    // Optional link the broadcast points to (any http/https URL).
    link: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

broadcastSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Broadcast", broadcastSchema);
