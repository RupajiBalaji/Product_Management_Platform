const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const Session = require("../models/Session");
const AuditLog = require("../models/AuditLog");
const { verifyToken, JWT_SECRET, COOKIE_NAME } = require("../middleware/auth");

const SESSION_EXPIRY_DAYS = 7;
const COOKIE_MAX_AGE = SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return true; // Allows login for pre-seeded users without pre-set passwords
  const [salt, key] = storedHash.split(":");
  if (!salt || !key) return false;
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(key, "hex"));
}

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

// ─── POST /api/auth/register — Universal Account Registration ─────────────────
router.post("/register", async (req, res) => {
  try {
    const { email, password, full_name, role_title, user_type } = req.body;

    if (!email || !email.includes("@")) {
      return res.status(400).json({ success: false, error: "Please enter a valid email address." });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, error: "Password must be at least 6 characters long." });
    }
    if (!full_name || !full_name.trim()) {
      return res.status(400).json({ success: false, error: "Please provide your full name." });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: "An account with this email address already exists. Please sign in instead.",
      });
    }

    // Role mapping supporting 3-tier governance
    let chosenRole = user_type;
    if (chosenRole === "pm") chosenRole = "product_lead";
    const validRoles = ["product_lead", "lead_architect", "employee"];
    if (!validRoles.includes(chosenRole)) {
      chosenRole = "employee";
    }

    const defaultRoleTitle =
      chosenRole === "product_lead"
        ? "Product Lead"
        : chosenRole === "lead_architect"
        ? "Lead Architect"
        : "Developer / Contributor";

    const userId = `usr_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const user = new User({
      _id: userId,
      email: cleanEmail,
      full_name: full_name.trim(),
      role_title: (role_title || "").trim() || defaultRoleTitle,
      user_type: chosenRole,
      password_hash: hashPassword(password),
      status: "active",
      last_login_at: new Date(),
    });

    await user.save();

    // Audit trail
    await AuditLog.record({
      actorId: user._id,
      action: "USER_REGISTERED",
      entityType: "User",
      entityId: user._id,
      after: {
        email: user.email,
        full_name: user.full_name,
        user_type: user.user_type,
        role_title: user.role_title,
      },
    });

    const token = issueSessionCookie(res, user);

    res.status(201).json({
      success: true,
      message: `Account created successfully as ${user.role_title}!`,
      token,
      user,
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/auth/login — Universal Account Sign In ─────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required." });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "No account found with this email address. Please click 'Create Account' to sign up.",
      });
    }

    if (user.status === "inactive") {
      return res.status(403).json({ success: false, error: "This account has been deactivated. Please contact your Product Lead." });
    }

    // Password verification
    if (user.password_hash) {
      const isValid = verifyPassword(password, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ success: false, error: "Incorrect password. Please verify and try again." });
      }
    } else {
      // Pre-seeded user signing in with password for the first time -> save hash
      user.password_hash = hashPassword(password);
    }

    user.last_login_at = new Date();
    await user.save();

    const token = issueSessionCookie(res, user);

    res.json({
      success: true,
      message: `Welcome back, ${user.full_name}!`,
      token,
      user,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create or sync session on login (Legacy / OAuth fallback)
router.post("/session", async (req, res) => {
  try {
    const { uid, email, full_name, role_title, photo_url, user_type } = req.body;
    if (!uid || !email) {
      return res.status(400).json({ success: false, error: "uid and email are required" });
    }

    let user = await User.findById(uid);
    if (!user) {
      const count = await User.countDocuments();
      const initialRole = (user_type === "pm" || user_type === "product_lead" || count === 0)
        ? "product_lead"
        : (user_type === "lead_architect" ? "lead_architect" : "employee");
      user = new User({
        _id: uid,
        email: email.toLowerCase(),
        full_name: full_name || email.split("@")[0],
        role_title: role_title || (initialRole === "product_lead" ? "Product Lead" : (initialRole === "lead_architect" ? "Lead Architect" : "Developer / Contributor")),
        user_type: initialRole,
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

// Cycle or set 3-tier role (product_lead -> lead_architect -> employee)
router.post("/switch-role", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.uid);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    const { targetRole } = req.body || {};
    const validRoles = ["product_lead", "lead_architect", "employee"];

    if (targetRole && validRoles.includes(targetRole)) {
      user.user_type = targetRole;
    } else {
      // Cycle: product_lead -> lead_architect -> employee -> product_lead
      const current = user.user_type === "pm" ? "product_lead" : user.user_type;
      if (current === "product_lead") user.user_type = "lead_architect";
      else if (current === "lead_architect") user.user_type = "employee";
      else user.user_type = "product_lead";
    }

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
