const mongoose = require("mongoose");

const appealSchema = new mongoose.Schema(
  {
    submission_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Submission",
      required: true,
      index: true,
    },
    employee_id: {
      type: String,
      ref: "User",
      required: true,
      index: true,
    },
    justification: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "overridden", "upheld"],
      default: "pending",
      index: true,
    },
    reviewer_id: {
      type: String,
      ref: "User",
      default: null,
    },
    reviewer_notes: {
      type: String,
      default: "",
      trim: true,
    },
    resolved_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

appealSchema.index({ submission_id: 1, status: 1 });
appealSchema.index({ employee_id: 1, status: 1 });

appealSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id;
  return obj;
};

module.exports = mongoose.model("Appeal", appealSchema);
