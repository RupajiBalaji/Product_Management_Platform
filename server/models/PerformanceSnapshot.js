const mongoose = require("mongoose");

const performanceSnapshotSchema = new mongoose.Schema(
  {
    user_id: { type: String, ref: "User", required: true, index: true },
    week_ending: { type: Date, required: true }, // ISO date, standardized to week-ending (Sunday)
    on_time_reliability_pct: { type: Number, default: 100 },
    first_pass_quality_pct: { type: Number, default: 100 },
    estimation_accuracy_pct: { type: Number, default: 100 }, // Inverted from variance: higher = more accurate
    tasks_completed: { type: Number, default: 0 },
    projects_active: [{ type: mongoose.Schema.Types.ObjectId, ref: "Project" }],
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// One snapshot per employee per week
performanceSnapshotSchema.index({ user_id: 1, week_ending: 1 }, { unique: true });
performanceSnapshotSchema.index({ week_ending: -1 });

module.exports = mongoose.model("PerformanceSnapshot", performanceSnapshotSchema);
