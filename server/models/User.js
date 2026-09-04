const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // Firebase UID or unique string ID
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    full_name: {
      type: String,
      required: true,
      trim: true,
    },
    role_title: {
      type: String,
      default: "Contributor",
      trim: true,
    },
    user_type: {
      type: String,
      enum: ["product_lead", "lead_architect", "employee", "pm"],
      required: true,
      default: "employee",
      index: true,
    },
    delegateUserId: {
      type: String,
      ref: "User",
      default: null,
    },
    defaultDailyCapHours: {
      type: Number,
      default: 8,
      min: 1,
      max: 24,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
    // CONFIDENTIAL field. Must never be returned in any API response to non-product_lead roles.
    hourly_cost_rate: {
      type: Number,
      default: 0,
      min: 0,
    },
    password_hash: {
      type: String,
      default: "",
    },
    photo_url: {
      type: String,
      default: "",
    },
    last_login_at: {
      type: Date,
      default: Date.now,
    },
    session_version: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id;
  delete obj.password_hash;
  return obj;
};

module.exports = mongoose.model("User", userSchema);
