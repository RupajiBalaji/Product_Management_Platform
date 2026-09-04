const express = require("express");
const router = express.Router();
const { verifyToken, requireLeadOrArchitect } = require("../middleware/auth");
const {
  getEmployeeGlobalAllocation,
  getDashboardCapacity,
} = require("../lib/capacityRegistry");
const User = require("../models/User");

// ─── GET /api/capacity/dashboard ─────────────────────────────────────────────
// product_lead or lead_architect only.
// Returns every active employee's global capacity snapshot for the portfolio view.
router.get("/dashboard", verifyToken, requireLeadOrArchitect, async (req, res) => {
  try {
    const snapshot = await getDashboardCapacity();
    res.json({ success: true, data: snapshot });
  } catch (err) {
    console.error("Capacity dashboard error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/capacity/:userId ────────────────────────────────────────────────
// product_lead / lead_architect can query any user.
// employee can only query their own ID (self-service check).
router.get("/:userId", verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Authorization: employees can only see their own capacity
    const isElevated = ["product_lead", "lead_architect", "pm"].includes(req.userType);
    if (!isElevated && String(req.uid) !== String(userId)) {
      return res.status(403).json({
        success: false,
        error: "Access denied. You can only view your own capacity.",
        code: "FORBIDDEN_OWN_CAPACITY_ONLY",
      });
    }

    // Validate user exists
    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    const allocation = await getEmployeeGlobalAllocation(userId);

    res.json({
      success: true,
      data: {
        ...allocation,
        name: user.full_name,
        email: user.email,
        roleTitle: user.role_title,
        userType: user.user_type,
      },
    });
  } catch (err) {
    console.error("Capacity fetch error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
