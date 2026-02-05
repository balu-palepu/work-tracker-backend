const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const User = require("../models/User");

const listAdmins = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected...\n");

    // Find all admin users
    const admins = await User.find({ role: "admin" }).select(
      "name email role createdAt",
    );
    const regularUsers = await User.find({ role: "user" }).select(
      "name email role",
    );

    console.log("=".repeat(60));
    console.log("SYSTEM ADMINISTRATORS");
    console.log("=".repeat(60));

    if (admins.length === 0) {
      console.log("No system administrators found");
    } else {
      admins.forEach((admin, index) => {
        console.log(`\n${index + 1}. ${admin.name}`);
        console.log(`Email: ${admin.email}`);
        console.log(`Role: ${admin.role}`);
        console.log(`Created: ${admin.createdAt.toLocaleDateString()}`);
      });
    }

    console.log("\n" + "=".repeat(60));
    console.log("SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total Admins: ${admins.length}`);
    console.log(`Total Regular Users: ${regularUsers.length}`);
    console.log(`Total Users: ${admins.length + regularUsers.length}`);

    process.exit(0);
  } catch (error) {
    console.error("Error listing admins:", error);
    process.exit(1);
  }
};

// Run the script
listAdmins();
