const mongoose = require("mongoose");
const dns = require("dns");

try {
  dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
} catch (e) {
  // Ignore in environments where setServers is restricted
}

let isConnected = false;

const DB_OPTIONS = {
  maxPoolSize: 25,
  minPoolSize: 5,
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
};

async function connectDB() {
  if (isConnected) return mongoose.connection;
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/acube-pm";

  try {
    const conn = await mongoose.connect(uri, DB_OPTIONS);
    isConnected = true;
    console.log(`✅ [MongoDB] Connected successfully to host: ${conn.connection.host}, database: ${conn.connection.name}`);
    return conn;
  } catch (err) {
    console.warn("⚠️  [MongoDB] Initial connection error:", err.message);
    console.warn("👉 Set MONGODB_URI in server/.env for cloud Atlas connection.");
    return null;
  }
}

// Connection event monitoring
mongoose.connection.on("connected", () => {
  isConnected = true;
  console.log("📡 [MongoDB Event] Connection established");
});

mongoose.connection.on("error", (err) => {
  console.error("❌ [MongoDB Event] Connection error:", err.message);
});

mongoose.connection.on("disconnected", () => {
  isConnected = false;
  console.warn("⚠️  [MongoDB Event] Connection lost. Attempting auto-reconnect...");
});

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  if (isConnected) {
    console.log(`🛑 [MongoDB] Closing connection due to ${signal}...`);
    await mongoose.connection.close();
    console.log("✅ [MongoDB] Connection closed safely.");
  }
};

process.on("SIGINT", () => gracefulShutdown("SIGINT").then(() => process.exit(0)));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM").then(() => process.exit(0)));

module.exports = connectDB;
