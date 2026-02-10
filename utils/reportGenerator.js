/**
 * Report generation utilities for exporting data
 */

/**
 * Convert array of objects to CSV string
 * @param {Array} data - Array of objects to convert
 * @param {Array} columns - Column definitions [{key: 'fieldName', header: 'Display Name'}]
 * @returns {string} CSV string
 */
const generateCSV = (data, columns) => {
  if (!data || data.length === 0) {
    return columns.map(col => col.header).join(',') + '\n';
  }

  // Header row
  const headers = columns.map(col => `"${col.header}"`).join(',');

  // Data rows
  const rows = data.map(item => {
    return columns.map(col => {
      let value = getNestedValue(item, col.key);

      // Handle different types
      if (value === null || value === undefined) {
        value = '';
      } else if (value instanceof Date) {
        value = value.toISOString().split('T')[0];
      } else if (typeof value === 'object') {
        value = JSON.stringify(value);
      }

      // Escape quotes and wrap in quotes
      value = String(value).replace(/"/g, '""');
      return `"${value}"`;
    }).join(',');
  });

  return [headers, ...rows].join('\n');
};

/**
 * Get nested value from object using dot notation
 * @param {Object} obj - Object to get value from
 * @param {string} path - Dot notation path (e.g., 'user.name')
 * @returns {*} Value at path
 */
const getNestedValue = (obj, path) => {
  if (!path) return obj;
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : null;
  }, obj);
};

/**
 * Format date for reports
 * @param {Date|string} date - Date to format
 * @param {string} format - 'date', 'datetime', 'time'
 * @returns {string} Formatted date string
 */
const formatDate = (date, format = 'date') => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  switch (format) {
    case 'datetime':
      return d.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    case 'time':
      return d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
    default:
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
  }
};

/**
 * Format duration in hours
 * @param {number} hours - Hours to format
 * @returns {string} Formatted duration
 */
const formatDuration = (hours) => {
  if (!hours || isNaN(hours)) return '0h';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

/**
 * Column definitions for different report types
 */
const REPORT_COLUMNS = {
  // Team Info Report
  teamInfo: [
    { key: 'user.name', header: 'Name' },
    { key: 'user.email', header: 'Email' },
    { key: 'role', header: 'Role' },
    { key: 'customTitle', header: 'Title' },
    { key: 'reportingManager.name', header: 'Reporting Manager' },
    { key: 'joinedAt', header: 'Joined Date' },
    { key: 'status', header: 'Status' }
  ],

  // Daily Activity Report
  dailyActivity: [
    { key: 'date', header: 'Date' },
    { key: 'user.name', header: 'User' },
    { key: 'totalHours', header: 'Total Hours' },
    { key: 'productivity', header: 'Productivity (1-10)' },
    { key: 'mood', header: 'Mood' },
    { key: 'notes', header: 'Notes' },
    { key: 'tasks', header: 'Tasks Completed' }
  ],

  // Bandwidth Report
  bandwidth: [
    { key: 'user.name', header: 'User' },
    { key: 'month', header: 'Month' },
    { key: 'year', header: 'Year' },
    { key: 'totalWorkingDays', header: 'Total Working Days' },
    { key: 'availableDays', header: 'Available Days' },
    { key: 'utilizationPercentage', header: 'Utilization %' },
    { key: 'status', header: 'Status' },
    { key: 'notes', header: 'Notes' }
  ],

  // Team Activity Summary
  teamActivity: [
    { key: 'user.name', header: 'User' },
    { key: 'totalActivities', header: 'Total Activities' },
    { key: 'totalHours', header: 'Total Hours' },
    { key: 'avgProductivity', header: 'Avg Productivity' },
    { key: 'tasksCompleted', header: 'Tasks Completed' },
    { key: 'activeDays', header: 'Active Days' }
  ],

  // Project Report
  project: [
    { key: 'name', header: 'Project Name' },
    { key: 'description', header: 'Description' },
    { key: 'status', header: 'Status' },
    { key: 'teamLead.name', header: 'Team Lead' },
    { key: 'memberCount', header: 'Members' },
    { key: 'totalTasks', header: 'Total Tasks' },
    { key: 'completedTasks', header: 'Completed Tasks' },
    { key: 'completionRate', header: 'Completion %' },
    { key: 'createdAt', header: 'Created Date' }
  ],

  // Sprint Report
  sprint: [
    { key: 'name', header: 'Sprint Name' },
    { key: 'project.name', header: 'Project' },
    { key: 'status', header: 'Status' },
    { key: 'startDate', header: 'Start Date' },
    { key: 'endDate', header: 'End Date' },
    { key: 'goal', header: 'Goal' },
    { key: 'totalTasks', header: 'Total Tasks' },
    { key: 'completedTasks', header: 'Completed Tasks' },
    { key: 'totalStoryPoints', header: 'Story Points' },
    { key: 'completedStoryPoints', header: 'Completed Points' },
    { key: 'velocity', header: 'Velocity' }
  ],

  // Task Report
  tasks: [
    { key: 'title', header: 'Task Title' },
    { key: 'description', header: 'Description' },
    { key: 'status', header: 'Status' },
    { key: 'priority', header: 'Priority' },
    { key: 'assignedTo.name', header: 'Assigned To' },
    { key: 'storyPoints', header: 'Story Points' },
    { key: 'dueDate', header: 'Due Date' },
    { key: 'completedAt', header: 'Completed Date' },
    { key: 'sprint.name', header: 'Sprint' },
    { key: 'createdAt', header: 'Created Date' }
  ]
};

/**
 * Generate report based on type
 * @param {string} reportType - Type of report
 * @param {Array} data - Data to include in report
 * @param {Object} options - Additional options
 * @returns {Object} { content: string, filename: string, contentType: string }
 */
const generateReport = (reportType, data, options = {}) => {
  const columns = REPORT_COLUMNS[reportType];
  if (!columns) {
    throw new Error(`Unknown report type: ${reportType}`);
  }

  const { format = 'csv', filename } = options;
  const timestamp = new Date().toISOString().split('T')[0];
  const defaultFilename = `${reportType}_report_${timestamp}`;

  let content;
  let contentType;
  let fileExtension;

  switch (format.toLowerCase()) {
    case 'csv':
    default:
      content = generateCSV(data, columns);
      contentType = 'text/csv';
      fileExtension = 'csv';
      break;
  }

  return {
    content,
    filename: `${filename || defaultFilename}.${fileExtension}`,
    contentType
  };
};

module.exports = {
  generateCSV,
  generateReport,
  formatDate,
  formatDuration,
  getNestedValue,
  REPORT_COLUMNS
};
