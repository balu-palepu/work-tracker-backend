const cron = require('node-cron');
const { createNotification } = require('../controllers/notificationController');
const TeamMember = require('../models/TeamMember');
const BandwidthReport = require('../models/BandwidthReport');

/**
 * Notification Scheduler Service
 * Handles automated notifications for various events
 */

const getNextMonthPeriod = (baseDate = new Date()) => {
  const month = baseDate.getMonth() + 1; // 1-12
  const year = baseDate.getFullYear();
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return { month: nextMonth, year: nextYear };
};

/**
 * Send monthly bandwidth report reminders
 * Runs on the 25th of every month at 9:00 AM
 */
const scheduleBandwidthReminders = () => {
  // Run on 25th of each month at 9:00 AM
  cron.schedule('0 9 25 * *', async () => {
    console.log('Running monthly bandwidth report reminders...');

    try {
      const { month: reportMonth, year: reportYear } = getNextMonthPeriod();

      // Get all active team members
      const teamMembers = await TeamMember.find({ status: 'active' })
        .populate('user', 'name email')
        .populate('team', 'name');

      for (const member of teamMembers) {
        // Check if they already submitted a report for next month
        const existingReport = await BandwidthReport.findOne({
          user: member.user._id,
          team: member.team._id,
          month: reportMonth,
          year: reportYear
        });

        // Only send reminder if no report exists
        if (!existingReport) {
          await createNotification({
            recipient: member.user._id,
            team: member.team._id,
            type: 'bandwidth_reminder',
            title: 'Bandwidth Report Due',
            message: `Please submit your bandwidth report for ${getMonthName(reportMonth)} ${reportYear}. Let us know your project allocations and availability.`,
            actionUrl: `/teams/${member.team._id}/bandwidth/new`
          });

          console.log(`Sent bandwidth reminder to ${member.user.email} for team ${member.team.name}`);
        }
      }

      console.log('Monthly bandwidth reminders sent successfully');
    } catch (error) {
      console.error('Error sending bandwidth reminders:', error);
    }
  });

  console.log('Bandwidth report reminder scheduler initialized for next-month reports (25th of each month at 9:00 AM)');
};


/**
 * Send reminders for overdue tasks
 * Runs daily at 10:00 AM
 */
const scheduleTaskReminders = () => {
  // Run daily at 10:00 AM
  cron.schedule('0 10 * * *', async () => {
    console.log('Running daily overdue task reminders...');

    try {
      const Task = require('../models/Tasks');
      const currentDate = new Date();
      currentDate.setHours(0, 0, 0, 0);

      // Find tasks that are due today or overdue and not completed
      const overdueTasks = await Task.find({
        dueDate: { $lte: currentDate },
        status: { $nin: ['completed', 'resolved', 'closed', 'done'] },
        assignedTo: { $exists: true, $ne: null }
      }).populate('assignedTo', 'name email')
        .populate('project', 'name')
        .populate('team', 'name');

      for (const task of overdueTasks) {
        if (task.assignedTo && task.team) {
          await createNotification({
            recipient: task.assignedTo._id,
            team: task.team._id,
            type: 'task_reminder',
            title: 'Overdue Task',
            message: `Task "${task.title}" in ${task.project?.name || 'your project'} is overdue. Please update the status.`,
            relatedTask: task._id,
            relatedProject: task.project?._id,
            actionUrl: `/teams/${task.team._id}/projects/${task.project?._id}`
          });
        }
      }

      console.log(`Sent ${overdueTasks.length} overdue task reminders`);
    } catch (error) {
      console.error('Error sending overdue task reminders:', error);
    }
  });

  console.log('Daily overdue task reminder scheduler initialized (Every day at 10:00 AM)');
};

/**
 * Send daily task reminders to all users with incomplete tasks
 * Runs at 2:00 PM and 5:00 PM local server time
 */
const scheduleDailyTaskReminders = () => {
  const sendReminders = async (label) => {
    console.log(`Running ${label} daily task reminders...`);

    try {
      const Task = require('../models/Tasks');

      // Find all incomplete tasks that are assigned to someone
      const incompleteTasks = await Task.find({
        status: { $nin: ['completed', 'resolved', 'closed', 'done'] },
        assignedTo: { $exists: true, $ne: null }
      }).populate('assignedTo', 'name email')
        .populate('project', 'name')
        .populate('team', 'name');

      // Group tasks by user+team so we send one notification per user per team
      const userTaskMap = {};
      for (const task of incompleteTasks) {
        if (!task.assignedTo || !task.team) continue;
        const key = `${task.assignedTo._id}_${task.team._id}`;
        if (!userTaskMap[key]) {
          userTaskMap[key] = {
            userId: task.assignedTo._id,
            userName: task.assignedTo.name,
            teamId: task.team._id,
            teamName: task.team.name,
            tasks: []
          };
        }
        userTaskMap[key].tasks.push(task);
      }

      let sentCount = 0;
      for (const entry of Object.values(userTaskMap)) {
        const taskCount = entry.tasks.length;
        const highPriorityCount = entry.tasks.filter(t => t.priority === 'urgent' || t.priority === 'high').length;

        let message = `You have ${taskCount} pending task${taskCount > 1 ? 's' : ''}`;
        if (highPriorityCount > 0) {
          message += ` (${highPriorityCount} high priority)`;
        }
        message += '. Please review and update your progress.';

        await createNotification({
          recipient: entry.userId,
          team: entry.teamId,
          type: 'task_reminder',
          title: 'Daily Task Reminder',
          message,
          actionUrl: `/teams/${entry.teamId}`
        });

        sentCount++;
      }

      console.log(`${label}: Sent daily task reminders to ${sentCount} users`);
    } catch (error) {
      console.error(`Error sending ${label} daily task reminders:`, error);
    }
  };

  // 2:00 PM every day
  cron.schedule('0 14 * * *', () => sendReminders('2 PM'));

  // 5:00 PM every day
  cron.schedule('0 17 * * *', () => sendReminders('5 PM'));

  console.log('Daily task reminder scheduler initialized (2:00 PM and 5:00 PM)');
};

/**
 * Helper function to get month name
 */
const getMonthName = (month) => {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[month - 1] || 'Unknown';
};

/**
 * Initialize all schedulers
 */
const initializeSchedulers = () => {
  console.log('Initializing notification schedulers...');

  scheduleBandwidthReminders();
  scheduleTaskReminders();
  scheduleDailyTaskReminders();

  console.log('All notification schedulers initialized successfully');
};

/**
 * Manual trigger for testing (for immediate execution)
 */
const sendImmediateBandwidthReminders = async () => {
  console.log('Manually triggering bandwidth reminders...');

  try {
    const { month: reportMonth, year: reportYear } = getNextMonthPeriod();

    const teamMembers = await TeamMember.find({ status: 'active' })
      .populate('user', 'name email')
      .populate('team', 'name');

    let sentCount = 0;

    for (const member of teamMembers) {
      const existingReport = await BandwidthReport.findOne({
        user: member.user._id,
        team: member.team._id,
        month: reportMonth,
        year: reportYear
      });

      if (!existingReport) {
        await createNotification({
          recipient: member.user._id,
          team: member.team._id,
          type: 'bandwidth_reminder',
          title: 'Bandwidth Report Due',
          message: `Please submit your bandwidth report for ${getMonthName(reportMonth)} ${reportYear}. Let us know your project allocations and availability.`,
          actionUrl: `/teams/${member.team._id}/bandwidth/new`
        });

        sentCount++;
      }
    }

    console.log(`Sent ${sentCount} bandwidth reminders`);
    return { success: true, count: sentCount };
  } catch (error) {
    console.error('Error sending immediate bandwidth reminders:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  initializeSchedulers,
  sendImmediateBandwidthReminders,
  scheduleBandwidthReminders,
  scheduleTaskReminders,
  scheduleDailyTaskReminders
};
