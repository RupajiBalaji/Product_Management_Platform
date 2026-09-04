const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    created_by: { type: String, ref: "User", required: true },
    status: {
      type: String,
      enum: ["active", "in-review", "completed", "frozen", "archived"],
      default: "active",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
      index: true,
    },
    member_ids: [{ type: String, ref: "User" }],
    team_allocations: [
      {
        user_id: { type: String, ref: "User", required: true },
        role_id: { type: mongoose.Schema.Types.ObjectId, ref: "DynamicRole" },
        daily_hours: { type: Number, default: 8, min: 1, max: 24 },
        allocated_at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

projectSchema.index({ member_ids: 1 });
projectSchema.index({ created_by: 1 });
projectSchema.index({ status: 1, priority: 1 });

const taskSchema = new mongoose.Schema(
  {
    project_id: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    start_date: { type: String, required: true }, // Format: YYYY-MM-DD
    end_date: { type: String, required: true },   // Format: YYYY-MM-DD
    assignee_ids: [{ type: String, ref: "User" }],
    status: {
      type: String,
      enum: ["active", "completed"],
      default: "active",
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

taskSchema.index({ project_id: 1 });
taskSchema.index({ assignee_ids: 1 });
taskSchema.index({ start_date: 1, end_date: 1 });

const dailyLogSchema = new mongoose.Schema(
  {
    task_id: { type: mongoose.Schema.Types.ObjectId, ref: "Task", required: true },
    project_id: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
    user_id: { type: String, ref: "User", required: true },
    log_date: { type: String, required: true }, // Format: YYYY-MM-DD
    work_text: { type: String, default: "", trim: true },
    has_worked: { type: Boolean, required: true },
    no_work_reason: { type: String, default: "", trim: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// Indexes for ultra-fast lookup and preventing duplicate logs
dailyLogSchema.index({ task_id: 1, user_id: 1, log_date: 1 }, { unique: true });
dailyLogSchema.index({ user_id: 1, log_date: -1 });
dailyLogSchema.index({ project_id: 1, log_date: -1 });

module.exports = {
  Project: mongoose.model("Project", projectSchema),
  Task: mongoose.model("Task", taskSchema),
  DailyLog: mongoose.model("DailyLog", dailyLogSchema),
};
