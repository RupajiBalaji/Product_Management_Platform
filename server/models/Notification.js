const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipient_id: { type: String, ref: "User", required: true }, // e.g. user_id or "product_lead"
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: [
        "slippage_escalation",
        "qa_rejection_loop",
        "capacity_conflict",
        "midday_p0_nudge",
        "sme_invite",
        "system",
      ],
      default: "system",
    },
    entity_id: { type: mongoose.Schema.Types.ObjectId },
    entity_type: { type: String, default: "SlippageEvent" },
    read: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

notificationSchema.index({ recipient_id: 1, read: 1 });
notificationSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
