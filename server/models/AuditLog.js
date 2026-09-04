const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: String, required: true, ref: "User", index: true },
    action: { type: String, required: true, trim: true, index: true }, // e.g., "ROLE_CREATED", "ROLE_UPDATED", "CAPACITY_OVERRIDDEN"
    entityType: { type: String, required: true, trim: true, index: true }, // e.g., "DynamicRole", "PRD", "CapacityOverride"
    entityId: { type: String, required: true, index: true },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

// Enforce append-only semantics: prevent updates and deletes on the collection
auditLogSchema.pre(["updateOne", "updateMany", "findOneAndUpdate", "replaceOne"], function () {
  throw new Error("AuditLog is append-only and cannot be modified.");
});

auditLogSchema.pre(["deleteOne", "deleteMany", "findOneAndDelete"], function () {
  throw new Error("AuditLog is append-only and cannot be deleted.");
});

// Helper function to easily record audit events
auditLogSchema.statics.record = async function ({ actorId, action, entityType, entityId, before = null, after = null }) {
  try {
    return await this.create({
      actorId: String(actorId || "system"),
      action,
      entityType,
      entityId: String(entityId || "unknown"),
      before: before ? JSON.parse(JSON.stringify(before)) : null,
      after: after ? JSON.parse(JSON.stringify(after)) : null,
      timestamp: new Date(),
    });
  } catch (err) {
    console.error("Failed to write to AuditLog:", err);
    // Don't crash main request if audit log write fails, but log error
    return null;
  }
};

module.exports = mongoose.model("AuditLog", auditLogSchema);
