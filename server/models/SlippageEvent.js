const mongoose = require("mongoose");

const slippageEventSchema = new mongoose.Schema(
  {
    user_id: { type: String, ref: "User", required: true },
    project_id: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    trigger_type: {
      type: String,
      enum: ["partial_work_streak", "repeated_qa_rejection"],
      required: true,
    },
    day_count: { type: Number, default: 0 },
    rejection_count: { type: Number, default: 0 },
    task_id: { type: mongoose.Schema.Types.ObjectId, ref: "Task" },
    level: {
      type: String,
      enum: ["normal", "warning", "escalation"],
      default: "normal",
    },
    cumulative_slippage_hours: { type: Number, default: 0 },
    downstream_impact: { type: String, default: "" },
    resolution_options_presented: [{ type: String }],
    resolved: { type: Boolean, default: false },
    resolved_by: { type: String, ref: "User" },
    resolution_chosen: { type: String },
    resolved_at: { type: Date },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// High performance query indexes
slippageEventSchema.index({ project_id: 1, resolved: 1 });
slippageEventSchema.index({ user_id: 1, resolved: 1 });
slippageEventSchema.index({ user_id: 1, project_id: 1, trigger_type: 1, resolved: 1 });
slippageEventSchema.index({ task_id: 1, resolved: 1 });

module.exports = mongoose.model("SlippageEvent", slippageEventSchema);
