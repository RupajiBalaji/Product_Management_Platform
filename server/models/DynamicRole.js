const mongoose = require("mongoose");

const dynamicRoleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    domain: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    skillTags: [
      {
        type: String,
        trim: true,
      },
    ],
    defaultDailyCapHours: {
      type: Number,
      required: true,
      default: 8,
      min: 1,
      max: 24,
    },
    createdBy: {
      type: String,
      ref: "User",
      required: false,
    },
    orgScoped: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

dynamicRoleSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id;
  return obj;
};

module.exports = mongoose.model("DynamicRole", dynamicRoleSchema);
