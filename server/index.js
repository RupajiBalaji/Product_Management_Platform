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

// Serve Static Frontend in Production (Render / Unified Deployment)
const path = require("path");
const fs = require("fs");
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
const server = app.listen(PORT, () => {
  console.log(`🚀 [Server] Production Express API running on http://localhost:${PORT}`);
});

module.exports = { app, server };
