const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    author_id: { type: String, ref: "User", required: true },
    content: { type: String, required: true, trim: true },
    created_at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const threadSchema = new mongoose.Schema(
  {
    topic: { type: String, required: true, trim: true },
    created_by: { type: String, ref: "User", required: true },
    messages: [messageSchema],
    linked_task_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },
    flagged_for_review: { type: Boolean, default: false },
    flagged_reason: { type: String, default: null },
    suggested_resolution: { type: String, default: null },
    created_at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const teamChannelSchema = new mongoose.Schema(
  {
    project_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      unique: true,
      index: true,
    },
    threads: [threadSchema],
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("TeamChannel", teamChannelSchema);
