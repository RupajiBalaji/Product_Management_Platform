const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    user_id: {
      type: String,
      ref: "User",
      required: true,
      index: true,
    },
    token_hash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    ip_address: {
      type: String,
      default: "",
    },
    user_agent: {
      type: String,
      default: "",
    },
    expires_at: {
      type: Date,
      required: true,
      index: { expires: 0 }, // MongoDB TTL index automatically removes expired sessions
    },
  },
  { timestamps: { createdAt: "created_at" } }
);

module.exports = mongoose.model("Session", sessionSchema);
