const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const User = require("../models/User");
const Team = require("../models/Team");
const Project = require("../models/Project");
const Notification = require("../models/Notification");

const createTestNotification = async (
  recipientEmail,
  notificationType = "task_assigned",
) => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected...");

    if (!recipientEmail) {
      console.log(
        "Usage: node create-test-notification.js <recipient-email> [notification-type]",
      );
      console.log(
        "Example: node create-test-notification.js user@gmail.com task_assigned",
      );
      console.log("\nAvailable notification types:");
      console.log("  - task_assigned");
      console.log("  - task_updated");
      console.log("  - task_completed");
      console.log("  - task_comment");
      console.log("  - task_reminder");
      console.log("  - mention");
      console.log("  - sprint_started");
      console.log("  - sprint_completed");
      console.log("  - project_added");
      console.log("  - project_assigned");
      console.log("  - bandwidth_approved");
      console.log("  - bandwidth_rejected");
      console.log("  - bandwidth_reminder");
      console.log("  - team_invite");
      console.log("  - role_changed");
      process.exit(1);
    }

    // Find recipient user
    const recipient = await User.findOne({
      email: recipientEmail.toLowerCase(),
    });
    if (!recipient) {
      console.log(`User with email "${recipientEmail}" not found`);
      process.exit(1);
    }

    // Get first team (or require team ID)
    const team = await Team.findOne();
    if (!team) {
      console.log("No teams found. Please create a team first.");
      process.exit(1);
    }

    // Get first project (optional)
    const project = await Project.findOne({ team: team._id });

    // Notification messages based on type
    const notificationMessages = {
      task_assigned: {
        title: "Task Assigned",
        message: "You have been assigned a new task: Test Task",
      },
      task_updated: {
        title: "Task Updated",
        message: "A task has been updated: Test Task",
      },
      task_completed: {
        title: "Task Completed",
        message: "Task 'Test Task' has been marked as completed",
      },
      task_comment: {
        title: "New Comment",
        message: "A new comment was added to task: Test Task",
      },
      task_reminder: {
        title: "Task Reminder",
        message: "Reminder: Task 'Test Task' is due soon",
      },
      mention: {
        title: "You were mentioned",
        message: "You were mentioned in a comment",
      },
      sprint_started: {
        title: "Sprint Started",
        message: "A new sprint has started: Test Sprint",
      },
      sprint_completed: {
        title: "Sprint Completed",
        message: "Sprint 'Test Sprint' has been completed",
      },
      project_added: {
        title: "Project Added",
        message: "You have been added to project: Test Project",
      },
      project_assigned: {
        title: "Assigned as Team Lead",
        message:
          "You have been assigned as team lead for project: Test Project",
      },
      bandwidth_approved: {
        title: "Bandwidth Report Approved",
        message: "Your bandwidth report for January 2025 has been approved",
      },
      bandwidth_rejected: {
        title: "Bandwidth Report Rejected",
        message: "Your bandwidth report for January 2025 has been rejected",
      },
      bandwidth_reminder: {
        title: "Bandwidth Report Reminder",
        message: "Don't forget to submit your bandwidth report for this month",
      },
      team_invite: {
        title: "Team Invitation",
        message: "You have been invited to join team: Test Team",
      },
      role_changed: {
        title: "Role Changed",
        message: "Your role has been changed to Manager",
      },
    };

    const notificationData =
      notificationMessages[notificationType] ||
      notificationMessages.task_assigned;

    // Create notification
    const notification = await Notification.create({
      recipient: recipient._id,
      team: team._id,
      type: notificationType,
      title: notificationData.title,
      message: notificationData.message,
      relatedProject: project?._id,
      actor: recipient._id, // Self notification for testing
      actionUrl: project
        ? `/teams/${team._id}/projects/${project._id}`
        : `/teams/${team._id}`,
    });

    console.log("\n✅ Test notification created successfully!");
    console.log(`\nNotification Details:`);
    console.log(`  ID: ${notification._id}`);
    console.log(`  Recipient: ${recipient.name} (${recipient.email})`);
    console.log(`  Type: ${notification.type}`);
    console.log(`  Title: ${notification.title}`);
    console.log(`  Message: ${notification.message}`);
    console.log(`  Team: ${team.name}`);
    console.log(`  Read Status: ${notification.isRead ? "Read" : "Unread"}`);
    console.log(`  Created At: ${notification.createdAt}`);

    process.exit(0);
  } catch (error) {
    console.error("Error creating notification:", error);
    process.exit(1);
  }
};

// Get arguments from command line
const recipientEmail = process.argv[2];
const notificationType = process.argv[3] || "task_assigned";
createTestNotification(recipientEmail, notificationType);
