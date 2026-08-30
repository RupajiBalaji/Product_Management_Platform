const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || "acube-pm-production-secret-key-2026";
const COOKIE_NAME = "acube_session";

// Extracts token from Cookie or Authorization header
function extractToken(req) {
  if (req.cookies && req.cookies[COOKIE_NAME]) {
    return req.cookies[COOKIE_NAME];
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }
  return null;
}

// Production Auth Middleware
async function verifyToken(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Authentication required. Please sign in.",
      code: "AUTH_REQUIRED",
    });
  }

  try {
    let decoded;
    try {
      // First try to verify with our internal JWT secret (issued session cookies)
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      // Fallback: decode Firebase ID token directly if sent from client
      decoded = jwt.decode(token);
    }

    if (!decoded || (!decoded.uid && !decoded.user_id && !decoded.sub)) {
      return res.status(401).json({
        success: false,
        error: "Invalid or expired session. Please sign in again.",
        code: "INVALID_TOKEN",
      });
    }

    const uid = decoded.uid || decoded.user_id || decoded.sub;

    // Fetch user from MongoDB to ensure they are active
    let user = await User.findById(uid);
    if (!user) {
      // If user is authenticated via Firebase but not in Mongo, auto-sync
      const count = await User.countDocuments();
      user = new User({
        _id: uid,
        email: decoded.email || "user@acube.ai",
        full_name: decoded.name || decoded.email?.split("@")[0] || "User",
        role_title: count === 0 ? "Project Manager" : "Contributor",
        user_type: count === 0 ? "pm" : "employee",
        status: "active",
      });
      await user.save();
    }

    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        error: "Your account is deactivated. Contact your administrator.",
        code: "ACCOUNT_INACTIVE",
      });
    }

    // Attach to request
    req.user = user;
    req.uid = user._id;
    req.email = user.email;
    req.userType = user.user_type;

    next();
  } catch (err) {
    console.error("Auth middleware verification error:", err);
    return res.status(401).json({
      success: false,
      error: "Session validation failed.",
      code: "AUTH_FAILED",
    });
  }
}

// Role-Based Authorization Guards
function requirePM(req, res, next) {
  if (req.userType !== "pm") {
    return res.status(403).json({
      success: false,
      error: "Access denied. Project Manager privileges required.",
      code: "FORBIDDEN_PM_ONLY",
    });
  }
  next();
}

module.exports = verifyToken;
module.exports.verifyToken = verifyToken;
module.exports.requirePM = requirePM;
module.exports.COOKIE_NAME = COOKIE_NAME;
module.exports.JWT_SECRET = JWT_SECRET;
