const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const User = require("../models/User");
const Team = require("../models/Team");
const TeamMember = require("../models/TeamMember");
const Project = require("../models/Project");
const Notification = require("../models/Notification");

const sendTestNotification = async (
  recipientEmail,
  actorEmail,
  notificationType = "task_assigned",
) => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected...");

    if (!recipientEmail) {
      console.log(
        "Usage: node send-test-notification.js <recipient-email> [actor-email] [notification-type]",
      );
      console.log(
        "Example: node send-test-notification.js recipient@gmail.com actor@gmail.com project_assigned",
      );
      console.log("\nAvailable notification types:");
      console.log("  - task_assigned");
      console.log("  - task_updated");
      console.log("  - task_completed");
      console.log("  - project_assigned");
      console.log("  - sprint_started");
      console.log("  - role_changed");
      console.log("  - team_invite");
      process.exit(1);
    }

    // Find recipient user
    const recipient = await User.findOne({
      email: recipientEmail.toLowerCase(),
    });
    if (!recipient) {
      console.log(`Recipient user with email "${recipientEmail}" not found`);
      process.exit(1);
    }

    // Find actor user (default to recipient if not provided)
    let actor = recipient;
    if (actorEmail) {
      actor = await User.findOne({ email: actorEmail.toLowerCase() });
      if (!actor) {
        console.log(`Actor user with email "${actorEmail}" not found`);
        process.exit(1);
      }
    }

    // Get first team
    const team = await Team.findOne();
    if (!team) {
      console.log("No teams found. Please create a team first.");
      process.exit(1);
    }

    // Verify recipient is team member
    const teamMember = await TeamMember.findOne({
      team: team._id,
      user: recipient._id,
    });
    if (!teamMember) {
      console.log(
        `Recipient "${recipient.email}" is not a member of team "${team.name}"`,
      );
      console.log("Adding recipient to team for testing...");
      await TeamMember.create({
        team: team._id,
        user: recipient._id,
        role: "member",
        status: "active",
      });
    }

    // Get first project (optional)
    const project = await Project.findOne({ team: team._id });

    // Notification messages based on type
    const notificationMessages = {
      task_assigned: {
        title: "Task Assigned",
        message: `${actor.name} assigned you a new task: "Complete test task"`,
      },
      task_updated: {
        title: "Task Updated",
        message: `${actor.name} updated task: "Test Task"`,
      },
      task_completed: {
        title: "Task Completed",
        message: `${actor.name} marked task "Test Task" as completed`,
      },
      project_assigned: {
        title: "Assigned as Team Lead",
        message: `${actor.name} assigned you as team lead for project: "${project?.name || "Test Project"}"`,
      },
      sprint_started: {
        title: "Sprint Started",
        message: `${actor.name} started a new sprint: "Sprint 1"`,
      },
      role_changed: {
        title: "Role Changed",
        message: `${actor.name} changed your role to Manager`,
      },
      team_invite: {
        title: "Team Invitation",
        message: `${actor.name} invited you to join team: "${team.name}"`,
      },
    };

    const notificationData =
      notificationMessages[notificationType] ||
      notificationMessages.task_assigned;

    // Create notification using the static method
    const notification = await Notification.createNotification({
      recipient: recipient._id,
      team: team._id,
      type: notificationType,
      title: notificationData.title,
      message: notificationData.message,
      relatedProject: project?._id,
      actor: actor._id,
      actionUrl: project
        ? `/teams/${team._id}/projects/${project._id}`
        : `/teams/${team._id}`,
    });

    if (!notification) {
      console.log(
        "\n⚠️  Notification not created (recipient is the same as actor)",
      );
      process.exit(0);
    }

    console.log("\n✅ Test notification sent successfully!");
    console.log(`\nNotification Details:`);
    console.log(`  ID: ${notification._id}`);
    console.log(`  Recipient: ${recipient.name} (${recipient.email})`);
    console.log(`  Actor: ${actor.name} (${actor.email})`);
    console.log(`  Type: ${notification.type}`);
    console.log(`  Title: ${notification.title}`);
    console.log(`  Message: ${notification.message}`);
    console.log(`  Team: ${team.name}`);
    if (project) {
      console.log(`  Project: ${project.name}`);
    }
    console.log(`  Read Status: ${notification.isRead ? "Read" : "Unread"}`);
    console.log(`  Created At: ${notification.createdAt}`);

    process.exit(0);
  } catch (error) {
    console.error("Error sending notification:", error);
    process.exit(1);
  }
};

// Get arguments from command line
const recipientEmail = process.argv[2];
const actorEmail = process.argv[3];
const notificationType = process.argv[4] || "task_assigned";
sendTestNotification(recipientEmail, actorEmail, notificationType);
