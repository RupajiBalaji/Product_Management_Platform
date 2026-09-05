const mongoose = require("mongoose");

const retrospectiveSchema = new mongoose.Schema(
  {
    project_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      unique: true,
      index: true,
    },
    generated_at: {
      type: Date,
      default: Date.now,
    },
    estimation_accuracy: {
      overall: {
        totalEstimatedHours: { type: Number, default: 0 },
        totalActualHours: { type: Number, default: 0 },
        variancePct: { type: Number, default: 0 },
      },
      byEmployee: [
        {
          userId: { type: String, ref: "User", required: true },
          estimatedHours: { type: Number, default: 0 },
          actualHours: { type: Number, default: 0 },
          variancePct: { type: Number, default: 0 },
        },
      ],
      byPhase: [
        {
          phaseOrTaskGroup: { type: String, default: "General" },
          estimatedHours: { type: Number, default: 0 },
          actualHours: { type: Number, default: 0 },
          variancePct: { type: Number, default: 0 },
        },
      ],
    },
    incident_summary: {
      slippageEventsCount: { type: Number, default: 0 },
      qaRejectionLoopCount: { type: Number, default: 0 },
      scopeChangesCount: { type: Number, default: 0 },
      blockerIncidentsCount: { type: Number, default: 0 },
    },
    success_metrics: [
      {
        metricDescription: { type: String, required: true },
        targetValue: { type: String, required: true },
        actualValue: { type: String, default: "" },
        achieved: { type: Boolean, default: null }, // null = not measurable from available data
      },
    ],
    lessons_learned: [{ type: String }],
    team_performance: [
      {
        userId: { type: String, ref: "User", required: true },
        onTimeReliabilityPct: { type: Number, default: 100 },
        firstPassQualityPct: { type: Number, default: 100 },
        tasksCompleted: { type: Number, default: 0 },
      },
    ],
    locked: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("Retrospective", retrospectiveSchema);
