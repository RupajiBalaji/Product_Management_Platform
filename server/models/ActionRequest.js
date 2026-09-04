const mongoose = require("mongoose");

const actionRequestSchema = new mongoose.Schema(
  {
    employee_id: { type: String, ref: "User", required: true },
    task_id: { type: mongoose.Schema.Types.ObjectId, ref: "Task", required: true },
    project_id: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    action_type: {
      type: String,
      enum: ["reorder", "swap_within_week", "postpone", "request_clarification"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["auto_approved", "blocked", "pending_clarification", "answered"],
      required: true,
      index: true,
    },
    payload: { type: mongoose.Schema.Types.Mixed },
    decision_reasoning: { type: String, default: "" },
    clarification_question: { type: String, default: "" },
    clarification_answer: { type: String, default: "" },
    answered_by: { type: String, ref: "User" },
    slippage_frozen: { type: Boolean, default: false },
    resolved_at: { type: Date },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

actionRequestSchema.index({ task_id: 1, created_at: -1 });
actionRequestSchema.index({ project_id: 1, status: 1 });
actionRequestSchema.index({ employee_id: 1, created_at: -1 });
actionRequestSchema.index({ status: 1, action_type: 1 });

module.exports = mongoose.model("ActionRequest", actionRequestSchema);
