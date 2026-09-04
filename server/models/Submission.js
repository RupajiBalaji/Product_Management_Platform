const mongoose = require("mongoose");

const submissionSchema = new mongoose.Schema(
  {
    task_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
      index: true,
    },
    employee_id: {
      type: String,
      ref: "User",
      required: true,
      index: true,
    },
    artifact_url: {
      type: String,
      required: true,
      trim: true,
    },
    artifact_type: {
      type: String,
      enum: ["pr_link", "figma_link", "file", "text"],
      default: "pr_link",
    },
    status: {
      type: String,
      enum: ["pending_review", "approved", "rejected"],
      default: "pending_review",
      index: true,
    },
    evaluation_mode: {
      type: String,
      enum: ["objective", "subjective"],
      default: "objective",
    },
    ai_verdict: {
      passed: {
        type: Boolean,
        default: null,
      },
      missing_items: [
        {
          type: String,
          trim: true,
        },
      ],
      reasoning: {
        type: String,
        default: "",
        trim: true,
      },
    },
    rejection_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    reviewed_by: {
      type: String,
      ref: "User",
      default: null,
    },
    reviewed_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

submissionSchema.index({ task_id: 1, status: 1 });
submissionSchema.index({ employee_id: 1, status: 1 });

submissionSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id;
  return obj;
};

module.exports = mongoose.model("Submission", submissionSchema);
