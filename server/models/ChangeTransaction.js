const mongoose = require("mongoose");

const utilizationImpactSchema = new mongoose.Schema(
  {
    userId: { type: String, ref: "User", required: true },
    newUtilizationPct: { type: Number, default: 0 },
  },
  { _id: false }
);

const consequenceSummarySchema = new mongoose.Schema(
  {
    deltaHours: { type: Number, default: 0 },
    deltaDays: { type: Number, default: 0 },
    deltaCost: { type: Number, default: 0 },
    affectedTaskIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Task" }],
    utilizationImpact: [utilizationImpactSchema],
  },
  { _id: false }
);

const taskModifiedSchema = new mongoose.Schema(
  {
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: "Task", required: true },
    before: { type: mongoose.Schema.Types.Mixed, default: {} },
    after: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const changeTransactionSchema = new mongoose.Schema(
  {
    project_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    requested_by: {
      type: String,
      ref: "User",
      required: true,
    },
    change_description: {
      type: String,
      required: true,
    },
    consequence_summary: {
      type: consequenceSummarySchema,
      required: true,
    },
    prd_version_before: {
      type: String,
      required: true,
    },
    prd_version_after: {
      type: String,
      required: true,
    },
    tasks_added: [{ type: mongoose.Schema.Types.ObjectId, ref: "Task" }],
    tasks_modified: [taskModifiedSchema],
    status: {
      type: String,
      enum: ["applied", "rolled_back"],
      default: "applied",
      index: true,
    },
    applied_at: {
      type: Date,
      default: Date.now,
    },
    rolled_back_at: {
      type: Date,
      default: null,
    },
    rolled_back_by: {
      type: String,
      ref: "User",
      default: null,
    },
    rollback_blocked_reason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ChangeTransaction", changeTransactionSchema);
