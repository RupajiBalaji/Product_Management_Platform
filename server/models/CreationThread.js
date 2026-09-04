const mongoose = require("mongoose");

const creationThreadSchema = new mongoose.Schema(
  {
    project_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "finalized"],
      default: "active",
      index: true,
    },
    messages: [
      {
        author_id: { type: String, ref: "User", required: true },
        author_role_at_time: {
          type: String,
          required: true,
          // snapshot: "product_lead" | "invited_expert" | "lead_architect" | etc.
        },
        content: { type: String, required: true, trim: true },
        created_at: { type: Date, default: Date.now },
      },
    ],
    invited_experts: [
      {
        user_id: { type: String, ref: "User", required: true },
        invited_by: { type: String, ref: "User", required: true },
        invited_at: { type: Date, default: Date.now },
        revoked_at: { type: Date, default: null }, // null while active
      },
    ],
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// Performance indexes
creationThreadSchema.index({ project_id: 1, status: 1 });
creationThreadSchema.index({ "invited_experts.user_id": 1 });

module.exports = mongoose.model("CreationThread", creationThreadSchema);
