const mongoose = require("mongoose");

const directMessageItemSchema = new mongoose.Schema(
  {
    author_id: { type: String, ref: "User", required: true },
    content: { type: String, required: true, trim: true },
    created_at: { type: Date, default: Date.now },
    read_at: { type: Date, default: null },
  },
  { _id: true }
);

const directMessageSchema = new mongoose.Schema(
  {
    project_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    participant_ids: [
      {
        type: String,
        ref: "User",
        required: true,
      },
    ],
    messages: [directMessageItemSchema],
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// Compound index for fast participant lookups within a project
directMessageSchema.index({ project_id: 1, participant_ids: 1 });

module.exports = mongoose.model("DirectMessage", directMessageSchema);
