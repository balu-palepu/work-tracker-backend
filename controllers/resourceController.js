const BandwidthReport = require('../models/BandwidthReport');
const TeamMember = require('../models/TeamMember');

/**
 * GET /api/teams/:teamId/resources
 * Returns all active team members enriched with their current-month bandwidth data.
 */
const getResourceOverview = async (req, res) => {
  try {
    const { teamId } = req.params;
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    // Get all active team members
    const teamMembers = await TeamMember.find({ team: teamId, status: 'active' })
      .populate('user', 'name email customTitle')
      .populate('reportingManager', 'name email');

    // Get bandwidth reports for the month
    const reports = await BandwidthReport.find({ team: teamId, month, year })
      .populate('allocations.project', 'name color');

    // Map reports by userId for fast lookup
    const reportMap = {};
    reports.forEach((r) => {
      reportMap[r.user.toString()] = r;
    });

    // Merge member + bandwidth data
    const members = teamMembers.map((tm) => {
      const userId = tm.user?._id?.toString();
      const report = reportMap[userId];

      let usedPercentage = 0;
      let allocations = [];
      let availableDays = null;
      let totalWorkingDays = null;

      if (report) {
        availableDays = report.availableDays;
        totalWorkingDays = report.totalWorkingDays;
        allocations = report.allocations || [];
        const totalAllocatedDays = allocations.reduce((s, a) => s + (a.allocatedDays || 0), 0);
        usedPercentage = availableDays > 0
          ? Math.round((totalAllocatedDays / availableDays) * 100)
          : 0;
      }

      return {
        _id: tm._id,
        user: tm.user,
        role: tm.role,
        customTitle: tm.customTitle,
        reportingManager: tm.reportingManager,
        reportId: report?._id || null,
        reportStatus: report?.status || null,
        availableDays,
        totalWorkingDays,
        allocations,
        usedPercentage,
      };
    });

    res.json({ success: true, data: members });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/teams/:teamId/resources/assign
 * Admin/Manager assigns a user to a project with a given allocation %.
 * Creates or updates the user's bandwidth report for the month.
 */
const assignResource = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { userId, projectId, allocationPercentage, month, year } = req.body;

    if (!userId || !projectId || !allocationPercentage) {
      return res.status(400).json({ success: false, message: 'userId, projectId, and allocationPercentage are required' });
    }

    const m = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year) || new Date().getFullYear();

    // Default working days for the month if no report exists
    const defaultWorkingDays = 20;

    let report = await BandwidthReport.findOne({ team: teamId, user: userId, month: m, year: y });

    if (!report) {
      // Create a draft report for the user
      report = await BandwidthReport.create({
        team: teamId,
        user: userId,
        month: m,
        year: y,
        totalWorkingDays: defaultWorkingDays,
        availableDays: defaultWorkingDays,
        allocations: [],
        status: 'draft',
      });
    }

    // Check if project already has an allocation
    const existingIndex = report.allocations.findIndex(
      (a) => a.project.toString() === projectId
    );

    const allocatedDays = Math.round((allocationPercentage / 100) * (report.availableDays || defaultWorkingDays));

    if (existingIndex >= 0) {
      report.allocations[existingIndex].allocatedDays = allocatedDays;
      report.allocations[existingIndex].allocatedPercentage = allocationPercentage;
    } else {
      report.allocations.push({
        project: projectId,
        allocatedDays,
        allocatedPercentage: allocationPercentage,
      });
    }

    // Allow saving even if status was approved (admin override)
    if (report.status === 'approved') report.status = 'submitted';

    await report.save();

    const updated = await BandwidthReport.findById(report._id)
      .populate('allocations.project', 'name color');

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/teams/:teamId/resources/remove-allocation
 * Removes a project allocation from a user's bandwidth report.
 */
const removeAllocation = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { userId, projectId, month, year } = req.body;

    const m = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year) || new Date().getFullYear();

    const report = await BandwidthReport.findOne({ team: teamId, user: userId, month: m, year: y });
    if (!report) return res.status(404).json({ success: false, message: 'Bandwidth report not found' });

    report.allocations = report.allocations.filter(
      (a) => a.project.toString() !== projectId
    );

    await report.save();
    res.json({ success: true, message: 'Allocation removed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/teams/:teamId/resources/direct-reports/:managerId
 */
const getDirectReports = async (req, res) => {
  try {
    const { teamId, managerId } = req.params;

    const members = await TeamMember.find({ team: teamId, reportingManager: managerId, status: 'active' })
      .populate('user', 'name email');

    res.json({ success: true, data: members });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getResourceOverview, assignResource, removeAllocation, getDirectReports };
