const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const User = require("../models/User");
const Notification = require("../models/Notification");

const listNotifications = async (userEmail, options = {}) => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected...");

    if (!userEmail) {
      console.log("Usage: node list-notifications.js <user-email> [--unread-only] [--limit=N]");
      console.log("Example: node list-notifications.js user@gmail.com --unread-only --limit=10");
      process.exit(1);
    }

    // Find user
    const user = await User.findOne({ email: userEmail.toLowerCase() });
    if (!user) {
      console.log(`User with email "${userEmail}" not found`);
      process.exit(1);
    }

    // Build query
    const query = { recipient: user._id };
    if (options.unreadOnly) {
      query.isRead = false;
    }

    // Get limit
    const limit = options.limit || 50;

    // Fetch notifications
    const notifications = await Notification.find(query)
      .populate('team', 'name')
      .populate('actor', 'name email')
      .populate('relatedProject', 'name')
      .populate('relatedTask', 'title')
      .sort({ createdAt: -1 })
      .limit(limit);

    // Get counts
    const totalCount = await Notification.countDocuments({ recipient: user._id });
    const unreadCount = await Notification.countDocuments({ 
      recipient: user._id, 
      isRead: false 
    });

    console.log(`\n📬 Notifications for ${user.name} (${user.email})`);
    console.log(`Total: ${totalCount} | Unread: ${unreadCount} | Showing: ${notifications.length}\n`);

    if (notifications.length === 0) {
      console.log("No notifications found.");
      process.exit(0);
    }

    // Display notifications
    notifications.forEach((notification, index) => {
      const readStatus = notification.isRead ? '✓' : '○';
      const readColor = notification.isRead ? '\x1b[90m' : '\x1b[36m'; // Gray if read, Cyan if unread
      const resetColor = '\x1b[0m';

      console.log(`${index + 1}. ${readColor}${readStatus}${resetColor} [${notification.type}] ${notification.title}`);
      console.log(`   ${notification.message}`);
      console.log(`   Team: ${notification.team?.name || 'N/A'} | Actor: ${notification.actor?.name || 'System'}`);
      if (notification.relatedProject) {
        console.log(`   Project: ${notification.relatedProject.name}`);
      }
      if (notification.relatedTask) {
        console.log(`   Task: ${notification.relatedTask.title}`);
      }
      console.log(`   Created: ${notification.createdAt.toLocaleString()}`);
      if (notification.isRead && notification.readAt) {
        console.log(`   Read: ${notification.readAt.toLocaleString()}`);
      }
      console.log('');
    });

    process.exit(0);
  } catch (error) {
    console.error("Error listing notifications:", error);
    process.exit(1);
  }
};

// Parse command line arguments
const userEmail = process.argv[2];
const options = {
  unreadOnly: process.argv.includes('--unread-only'),
  limit: parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '50')
};

listNotifications(userEmail, options);
