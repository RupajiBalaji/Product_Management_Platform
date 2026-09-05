const mongoose = require("mongoose");

const userStorySchema = new mongoose.Schema(
  {
    story: { type: String, required: true },
    given: { type: String, default: "" },
    when: { type: String, default: "" },
    then: { type: String, default: "" },
  },
  { _id: false }
);

const teamCompositionSchema = new mongoose.Schema(
  {
    userId: { type: String, ref: "User", required: true },
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: "DynamicRole" },
  },
  { _id: false }
);

const diffSummarySchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const prdSchema = new mongoose.Schema(
  {
    project_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    version: {
      type: String,
      required: true,
      default: "1.0",
    },
    executive_summary: {
      type: String,
      default: "",
    },
    scope_in: [{ type: String }],
    scope_out: [{ type: String }],
    user_stories: [userStorySchema],
    technical_architecture: {
      type: String,
      default: "",
    },
    team_composition: [teamCompositionSchema],
    status: {
      type: String,
      enum: ["draft", "approved", "superseded"],
      default: "draft",
    },
    superseded_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PRD",
      default: null,
    },
    diff_summary: [diffSummarySchema],
    created_by: {
      type: String,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Unique compound index: only one document per (project_id, version)
prdSchema.index({ project_id: 1, version: 1 }, { unique: true });

module.exports = mongoose.model("PRD", prdSchema);
