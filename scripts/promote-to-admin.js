const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const User = require("../models/User");

const promoteToAdmin = async (email) => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected...");

    if (!email) {
      console.log("Usage: node promote-to-admin.js <user-email>");
      console.log("Example: node promote-to-admin.js user@gmail.com");
      process.exit(1);
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      console.log(`User with email "${email}" not found`);
      process.exit(1);
    }

    // Check if already admin
    if (user.role === "admin") {
      console.log(`User "${user.name}" (${user.email}) is already an admin`);
      process.exit(0);
    }

    // Promote to admin
    user.role = "admin";
    await user.save();

    console.log("ser promoted to admin successfully!");
    console.log(`Name: ${user.name}`);
    console.log(`Email: ${user.email}`);
    console.log(`Role: ${user.role}`);
    console.log("\nThis user can now:");
    console.log("Create new teams");
    console.log("Have full system-level privileges");

    process.exit(0);
  } catch (error) {
    console.error("Error promoting user:", error);
    process.exit(1);
  }
};

// Get email from command line arguments
const email = process.argv[2];
promoteToAdmin(email);
