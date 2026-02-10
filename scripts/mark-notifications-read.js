const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const User = require("../models/User");
const Notification = require("../models/Notification");

const markNotificationsRead = async (userEmail, notificationId = null) => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected...");

    if (!userEmail) {
      console.log("Usage: node mark-notifications-read.js <user-email> [notification-id]");
      console.log("Example: node mark-notifications-read.js user@gmail.com");
      console.log("Example: node mark-notifications-read.js user@gmail.com <notification-id>");
      process.exit(1);
    }

    // Find user
    const user = await User.findOne({ email: userEmail.toLowerCase() });
    if (!user) {
      console.log(`User with email "${userEmail}" not found`);
      process.exit(1);
    }

    if (notificationId) {
      // Mark single notification as read
      const notification = await Notification.findById(notificationId);
      if (!notification) {
        console.log(`Notification with ID "${notificationId}" not found`);
        process.exit(1);
      }

      if (notification.recipient.toString() !== user._id.toString()) {
        console.log("Notification does not belong to this user");
        process.exit(1);
      }

      await notification.markAsRead();
      console.log(`\n✅ Notification marked as read!`);
      console.log(`  ID: ${notification._id}`);
      console.log(`  Title: ${notification.title}`);
      console.log(`  Read At: ${notification.readAt}`);
    } else {
      // Mark all notifications as read
      const result = await Notification.updateMany(
        {
          recipient: user._id,
          isRead: false
        },
        {
          isRead: true,
          readAt: new Date()
        }
      );

      console.log(`\nMarked ${result.modifiedCount} notification(s) as read!`);
    }

    process.exit(0);
  } catch (error) {
    console.error("Error marking notifications as read:", error);
    process.exit(1);
  }
};

// Get arguments from command line
const userEmail = process.argv[2];
const notificationId = process.argv[3] || null;
markNotificationsRead(userEmail, notificationId);
