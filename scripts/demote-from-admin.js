const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const User = require("../models/User");

const demoteFromAdmin = async (email) => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected...");

    if (!email) {
      console.log("Usage: node demote-from-admin.js <user-email>");
      console.log("Example: node demote-from-admin.js admin@example.com");
      process.exit(1);
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      console.log(`User with email "${email}" not found`);
      process.exit(1);
    }

    // Check if already a regular user
    if (user.role === "user") {
      console.log(
        `User "${user.name}" (${user.email}) is already a regular user`,
      );
      process.exit(0);
    }

    // Demote to regular user
    user.role = "user";
    await user.save();

    console.log("User demoted to regular user successfully!");
    console.log(`Name: ${user.name}`);
    console.log(`Email: ${user.email}`);
    console.log(`Role: ${user.role}`);
    console.log("\nThis user can now:");
    console.log("  • Be assigned to teams");
    console.log("  • Cannot create new teams");

    process.exit(0);
  } catch (error) {
    console.error("Error demoting user:", error);
    process.exit(1);
  }
};

// Get email from command line arguments
const email = process.argv[2];
demoteFromAdmin(email);
