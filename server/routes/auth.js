const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Session = require("../models/Session");
const { verifyToken, JWT_SECRET, COOKIE_NAME } = require("../middleware/auth");

const SESSION_EXPIRY_DAYS = 7;
const COOKIE_MAX_AGE = SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

// Cookie configuration for production security
function getCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  };
}

// Issue session token and set HTTP-only cookie
function issueSessionCookie(res, user) {
  const payload = {
    uid: user._id,
    email: user.email,
    name: user.full_name,
    user_type: user.user_type,
    session_version: user.session_version || 1,
  };

  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: `${SESSION_EXPIRY_DAYS}d`,
  });

  res.cookie(COOKIE_NAME, token, getCookieOptions());
  return token;
}

// Create or sync session on login
router.post("/session", async (req, res) => {
  try {
    const { uid, email, full_name, role_title, photo_url, user_type } = req.body;
    if (!uid || !email) {
      return res.status(400).json({ success: false, error: "uid and email are required" });
    }

    let user = await User.findById(uid);
    if (!user) {
      const count = await User.countDocuments();
      user = new User({
        _id: uid,
        email: email.toLowerCase(),
        full_name: full_name || email.split("@")[0],
        role_title: role_title || (user_type === "pm" || count === 0 ? "Project Manager" : "Developer / Contributor"),
        user_type: user_type || (count === 0 ? "pm" : "employee"),
        photo_url: photo_url || "",
        status: "active",
        last_login_at: new Date(),
      });
      await user.save();
    } else {
      user.last_login_at = new Date();
      if (full_name) user.full_name = full_name;
      if (photo_url) user.photo_url = photo_url;
      if (role_title) user.role_title = role_title;
      if (user_type) user.user_type = user_type;
      await user.save();
    }

    const token = issueSessionCookie(res, user);

    res.json({
      success: true,
      token,
      user,
    });
  } catch (err) {
    console.error("Session creation error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get current session
router.get("/me", verifyToken, (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

// Logout and clear session cookie
router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    path: "/",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res.json({ success: true, message: "Logged out successfully" });
});

// Toggle role (PM <-> Developer)
router.post("/switch-role", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.uid);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    user.user_type = user.user_type === "pm" ? "employee" : "pm";
    user.session_version = (user.session_version || 1) + 1;
    await user.save();

    // Re-issue cookie with new role
    issueSessionCookie(res, user);

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Multi-user fast switch (Allows switching between different employee personas for multi-user testing)
router.post("/switch-user/:userId", verifyToken, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: "Target user not found" });
    }

    targetUser.last_login_at = new Date();
    await targetUser.save();

    issueSessionCookie(res, targetUser);

    res.json({
      success: true,
      message: `Switched session to ${targetUser.full_name} (${targetUser.user_type})`,
      user: targetUser,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
