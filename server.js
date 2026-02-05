require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/database");
const { errorHandler, notFound } = require("./middleware/errorHandler");
const { logAuthAttempt, logSuspiciousActivity, logUnauthorizedAccess } = require("./middleware/securityLogger");

// Initialize app
const app = express();

app.set("trust proxy", 1);

// Connect to database
connectDB();

// Security Middleware
// Set security HTTP headers
app.use(helmet());

// Enable CORS
const corsOptions = {
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// Body parser middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Data sanitization against XSS
app.use(xss());

// Security logging middleware
app.use(logSuspiciousActivity);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 600, // limit each IP to 600 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", limiter);

// Stricter rate limit for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many login attempts, please try again later.",
  skipSuccessfulRequests: true,
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use("/api/auth", logAuthAttempt, require("./routes/auth"));
app.use("/api/teams", require("./routes/teams"));
app.use("/api/activities", require("./routes/activities"));

// Team-scoped routes
app.use('/api/teams/:teamId/projects', require("./routes/projects"));
app.use('/api/teams/:teamId/projects/:projectId/members', require("./routes/projectMembers"));
app.use('/api/teams/:teamId/projects/:projectId/sprints', require("./routes/sprints"));
app.use('/api/teams/:teamId/bandwidth', require("./routes/bandwidth"));
app.use('/api/teams/:teamId/admin', require("./routes/admin"));
app.use('/api/teams/:teamId/notifications', require("./routes/notifications"));

// 404 handler
app.use(notFound);

// Log unauthorized access attempts
app.use(logUnauthorizedAccess);

// Error handler middleware (must be last)
app.use(errorHandler);

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Promise Rejection:", err);
  // Close server & exit process
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);

  // Initialize notification schedulers
  const { initializeSchedulers } = require('./services/notificationScheduler');
  initializeSchedulers();
});

module.exports = app;
