const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const connectDB = require("./db");

// Routes
const authRoutes = require("./routes/auth");
const usersRoutes = require("./routes/users");
const projectsRoutes = require("./routes/projects");
const tasksRoutes = require("./routes/tasks");
const logsRoutes = require("./routes/logs");
const analyticsRoutes = require("./routes/analytics");
const aiRoutes = require("./routes/ai");
const rolesRoutes = require("./routes/roles");
const capacityRoutes = require("./routes/capacity");
const submissionsRoutes = require("./routes/submissions");
const appealsRoutes = require("./routes/appeals");
const slippageRoutes = require("./routes/slippage");
const actionsRoutes = require("./routes/actions");
const portfolioRoutes = require("./routes/portfolio");
const creationThreadRoutes = require("./routes/creationThread");
const { startSlippageCron, runSlippageCheck } = require("./jobs/slippageChecker");
const { startPriorityNudgeCron, runMiddayPriorityNudge } = require("./jobs/priorityNudge");
const seedDatabase = require("./seed");
const { verifyToken, requirePM } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 5000;
const IS_PROD = process.env.NODE_ENV === "production";

// Connect to MongoDB
connectDB();

// Security Headers with Helmet
app.use(
  helmet({
    contentSecurityPolicy: false, // Managed by Vite in dev
    crossOriginEmbedderPolicy: false,
  })
);

// Logging
app.use(morgan(IS_PROD ? "combined" : "dev"));

// Body & Cookie Parsers
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(cookieParser(process.env.JWT_SECRET || "acube-pm-production-secret-key-2026"));

// CORS Configuration with Credentials Support
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
  process.env.CLIENT_ORIGIN,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true); // Dev-friendly fallback
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  })
);

// Rate Limiters
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  message: { success: false, error: "Too many requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { success: false, error: "Too many auth attempts. Please try again later." },
});

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { success: false, error: "AI query rate limit reached. Please wait a moment." },
});

app.use("/api/", generalLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/ai", aiLimiter);

// Mount API Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/projects", projectsRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/logs", logsRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/roles", rolesRoutes);
app.use("/api/capacity", capacityRoutes);
app.use("/api/submissions", submissionsRoutes);
app.use("/api/appeals", appealsRoutes);
app.use("/api/slippage", slippageRoutes);
app.use("/api/actions", actionsRoutes);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api", creationThreadRoutes);

// Internal runner endpoint for automated/manual slippage check
app.post("/api/internal/run-slippage-check", async (req, res) => {
  try {
    const secretHeader = req.headers["x-internal-secret"];
    const expectedSecret = process.env.INTERNAL_SECRET || "autonomous-pm-internal-secret";

    if (secretHeader !== expectedSecret) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized: Invalid or missing x-internal-secret header",
      });
    }

    const results = await runSlippageCheck();
    return res.json({ success: true, results });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Internal runner endpoint for automated/manual midday P0 priority nudge
app.post("/api/internal/run-priority-nudge", async (req, res) => {
  try {
    const secretHeader = req.headers["x-internal-secret"];
    const expectedSecret = process.env.INTERNAL_SECRET || "autonomous-pm-internal-secret";

    if (secretHeader !== expectedSecret) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized: Invalid or missing x-internal-secret header",
      });
    }

    const { date } = req.body || {};
    const results = await runMiddayPriorityNudge(date);
    return res.json({ success: true, results });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Seed API endpoint (Protected)
app.post("/api/seed", verifyToken, async (req, res) => {
  try {
    await seedDatabase(req.uid);
    res.json({ success: true, message: "MongoDB seeded successfully with sample data linked to your account!" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || "development",
  });
});

// Favicon & Branding Logo endpoints (Explicitly serve platform brand logo for direct API browser tabs)
app.get("/favicon.ico", (req, res) => {
  const icoPath = path.resolve(process.cwd(), "public", "favicon.ico");
  const logoPath = path.resolve(process.cwd(), "public", "logo.png");
  res.setHeader("Cache-Control", "public, max-age=86400");
  if (fs.existsSync(icoPath)) {
    res.type("image/x-icon");
    return res.sendFile(icoPath);
  }
  if (fs.existsSync(logoPath)) {
    res.type("image/png");
    return res.sendFile(logoPath);
  }
  res.status(204).end();
});

app.get("/logo.png", (req, res) => {
  const logoPath = path.resolve(process.cwd(), "public", "logo.png");
  if (fs.existsSync(logoPath)) {
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.type("image/png");
    return res.sendFile(logoPath);
  }
  res.status(404).end();
});

// Serve Static Frontend in Production (Render / Unified Deployment)
const distPath = path.resolve(process.cwd(), "dist");

console.log(`📁 [Static Files] Serving frontend from: ${distPath} (Exists: ${fs.existsSync(distPath)})`);

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// Fallback for SPA client-side routing (Express 5 compatible)
app.use((req, res, next) => {
  if (req.originalUrl.startsWith("/api/")) {
    return next();
  }
  const indexPath = path.join(distPath, "index.html");
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  next();
});

// 404 Handler for unhandled API and missing static routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
    code: "NOT_FOUND",
  });
});

// Global Centralized Error Handler
app.use((err, req, res, _next) => {
  console.error("💥 Unhandled Error:", err);
  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: err.message || "An unexpected internal server error occurred.",
    code: err.code || "INTERNAL_SERVER_ERROR",
    ...(IS_PROD ? {} : { stack: err.stack }),
  });
});

// Start Server
let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`🚀 [Server] Production Express API running on http://localhost:${PORT}`);
    // Initialize automated daily slippage checker cron job
    startSlippageCron();
    // Initialize automated midday P0 priority nudge cron job
    startPriorityNudgeCron();
  });
}

module.exports = { app, server };

