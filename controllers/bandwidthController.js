const BandwidthReport = require('../models/BandwidthReport');
const Project = require('../models/Project');

/**
 * @desc    Get user's bandwidth reports
 * @route   GET /api/teams/:teamId/bandwidth/my
 * @access  Private
 */
exports.getMyReports = async (req, res) => {
  try {
    const { teamId } = req.params;

    const reports = await BandwidthReport.find({
      team: teamId,
      user: req.user._id
    })
      .populate('allocations.project', 'name color')
      .populate('approvedBy', 'name email')
      .sort({ year: -1, month: -1 });

    res.json({
      success: true,
      count: reports.length,
      data: reports
    });
  } catch (error) {
    console.error('Get my reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching reports',
      error: error.message
    });
  }
};

/**
 * @desc    Get all bandwidth reports (admin only)
 * @route   GET /api/teams/:teamId/bandwidth
 * @access  Private (Admin)
 */
exports.getAllReports = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { status, year, month, page = 1, limit = 10, sortBy = 'year', sortOrder = 'desc' } = req.query;

    // Build query
    const query = { team: teamId };
    if (status) query.status = status;
    if (year) query.year = parseInt(year);
    if (month) query.month = parseInt(month);

    // Get total count
    const totalCount = await BandwidthReport.countDocuments(query);

    // Build sort object
    const sortObj = {};
    if (sortBy === 'userName') {
      sortObj['user.name'] = sortOrder === 'asc' ? 1 : -1;
    } else if (sortBy === 'status') {
      sortObj['status'] = sortOrder === 'asc' ? 1 : -1;
    } else if (sortBy === 'year') {
      sortObj['year'] = sortOrder === 'asc' ? 1 : -1;
      sortObj['month'] = sortOrder === 'asc' ? 1 : -1;
    } else if (sortBy === 'month') {
      sortObj['month'] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;
    }

    const reports = await BandwidthReport.find(query)
      .populate('user', 'name email')
      .populate('allocations.project', 'name color')
      .populate('approvedBy', 'name email')
      .sort(sortObj)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: reports.length,
      total: totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / limit),
      data: reports
    });
  } catch (error) {
    console.error('Get all reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching reports',
      error: error.message
    });
  }
};

/**
 * @desc    Get pending bandwidth reports (admin only)
 * @route   GET /api/teams/:teamId/bandwidth/pending
 * @access  Private (Admin)
 */
exports.getPendingReports = async (req, res) => {
  try {
    const { teamId } = req.params;

    const reports = await BandwidthReport.find({
      team: teamId,
      status: 'submitted'
    })
      .populate('user', 'name email')
      .populate('allocations.project', 'name color')
      .sort({ submittedAt: 1 });

    res.json({
      success: true,
      count: reports.length,
      data: reports
    });
  } catch (error) {
    console.error('Get pending reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pending reports',
      error: error.message
    });
  }
};

/**
 * @desc    Create bandwidth report
 * @route   POST /api/teams/:teamId/bandwidth
 * @access  Private
 */
exports.createReport = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { month, year } = req.body;

    // Check if report already exists for this period
    const existingReport = await BandwidthReport.findOne({
      team: teamId,
      user: req.user._id,
      month,
      year
    });

    if (existingReport) {
      return res.status(400).json({
        success: false,
        message: 'Report already exists for this period'
      });
    }

    // Create report (auto-approved, no approval workflow)
    const report = await BandwidthReport.create({
      ...req.body,
      team: teamId,
      user: req.user._id,
      status: 'approved',
      submittedAt: new Date(),
      approvedAt: new Date()
    });

    const populatedReport = await BandwidthReport.findById(report._id)
      .populate('allocations.project', 'name color');

    res.status(201).json({
      success: true,
      data: populatedReport
    });
  } catch (error) {
    console.error('Create report error:', error);
    res.status(400).json({
      success: false,
      message: 'Error creating report',
      error: error.message
    });
  }
};

/**
 * @desc    Get single bandwidth report
 * @route   GET /api/teams/:teamId/bandwidth/:reportId
 * @access  Private
 */
exports.getReport = async (req, res) => {
  try {
    const report = await BandwidthReport.findById(req.params.reportId)
      .populate('user', 'name email')
      .populate('allocations.project', 'name color')
      .populate('approvedBy', 'name email');

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Check permissions (user can view their own, admins can view all)
    const isOwner = report.user._id.toString() === req.user._id.toString();
    const isAdmin = req.teamMembership.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this report'
      });
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Get report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching report',
      error: error.message
    });
  }
};

/**
 * @desc    Update bandwidth report
 * @route   PUT /api/teams/:teamId/bandwidth/:reportId
 * @access  Private
 */
exports.updateReport = async (req, res) => {
  try {
    let report = await BandwidthReport.findById(req.params.reportId);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Check ownership
    if (report.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this report'
      });
    }

    report = await BandwidthReport.findByIdAndUpdate(
      req.params.reportId,
      {
        ...req.body,
        status: 'approved',
        approvedAt: new Date()
      },
      { new: true, runValidators: true }
    )
      .populate('allocations.project', 'name color')
      .populate('approvedBy', 'name email');

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Update report error:', error);
    res.status(400).json({
      success: false,
      message: 'Error updating report',
      error: error.message
    });
  }
};

/**
 * @desc    Delete bandwidth report
 * @route   DELETE /api/teams/:teamId/bandwidth/:reportId
 * @access  Private
 */
exports.deleteReport = async (req, res) => {
  try {
    const report = await BandwidthReport.findById(req.params.reportId);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Check ownership
    if (report.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this report'
      });
    }

    await report.deleteOne();

    res.json({
      success: true,
      message: 'Report deleted successfully'
    });
  } catch (error) {
    console.error('Delete report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting report',
      error: error.message
    });
  }
};

/**
 * @desc    Submit bandwidth report
 * @route   POST /api/teams/:teamId/bandwidth/:reportId/submit
 * @access  Private
 */
exports.submitReport = async (req, res) => {
  try {
    const report = await BandwidthReport.findById(req.params.reportId);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Check ownership
    if (report.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to submit this report'
      });
    }

    await report.submit();

    const updatedReport = await BandwidthReport.findById(report._id)
      .populate('allocations.project', 'name color');

    res.json({
      success: true,
      data: updatedReport,
      message: 'Report submitted for approval'
    });
  } catch (error) {
    console.error('Submit report error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Error submitting report'
    });
  }
};

/**
 * @desc    Approve bandwidth report
 * @route   POST /api/teams/:teamId/bandwidth/:reportId/approve
 * @access  Private (Admin)
 */
exports.approveReport = async (req, res) => {
  try {
    const report = await BandwidthReport.findById(req.params.reportId);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    await report.approve(req.user._id);

    const updatedReport = await BandwidthReport.findById(report._id)
      .populate('user', 'name email')
      .populate('allocations.project', 'name color')
      .populate('approvedBy', 'name email');

    res.json({
      success: true,
      data: updatedReport,
      message: 'Report approved successfully'
    });
  } catch (error) {
    console.error('Approve report error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Error approving report'
    });
  }
};

/**
 * @desc    Reject bandwidth report
 * @route   POST /api/teams/:teamId/bandwidth/:reportId/reject
 * @access  Private (Admin)
 */
exports.rejectReport = async (req, res) => {
  try {
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const report = await BandwidthReport.findById(req.params.reportId);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    await report.reject(reason);

    const updatedReport = await BandwidthReport.findById(report._id)
      .populate('user', 'name email')
      .populate('allocations.project', 'name color');

    res.json({
      success: true,
      data: updatedReport,
      message: 'Report rejected'
    });
  } catch (error) {
    console.error('Reject report error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Error rejecting report'
    });
  }
};

/**
 * @desc    Get bandwidth summary/analytics
 * @route   GET /api/teams/:teamId/bandwidth/summary
 * @access  Private (Admin)
 */
exports.getBandwidthSummary = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { year, month } = req.query;

    // Build query for specific period or latest
    const query = { team: teamId };
    if (year) query.year = parseInt(year);
    if (month) query.month = parseInt(month);

    const reports = await BandwidthReport.find(query)
      .populate('user', 'name email')
      .populate('allocations.project', 'name color');

    // Calculate team-wide metrics
    const totalAvailableDays = reports.reduce((sum, r) => sum + r.availableDays, 0);
    const totalAllocatedDays = reports.reduce((sum, r) => sum + r.totalAllocatedDays, 0);
    const avgUtilization = reports.length > 0
      ? reports.reduce((sum, r) => sum + r.utilizationPercentage, 0) / reports.length
      : 0;

    // Project-wise allocation summary
    const projectAllocations = {};
    reports.forEach(report => {
      report.allocations.forEach(alloc => {
        const projectId = alloc.project._id.toString();
        if (!projectAllocations[projectId]) {
          projectAllocations[projectId] = {
            project: alloc.project,
            totalDays: 0,
            resourceCount: 0
          };
        }
        projectAllocations[projectId].totalDays += alloc.allocatedDays;
        projectAllocations[projectId].resourceCount += 1;
      });
    });

    res.json({
      success: true,
      data: {
        totalReports: reports.length,
        totalAvailableDays,
        totalAllocatedDays,
        avgUtilization: Math.round(avgUtilization),
        unallocatedDays: totalAvailableDays - totalAllocatedDays,
        projectAllocations: Object.values(projectAllocations),
        reports
      }
    });
  } catch (error) {
    console.error('Get bandwidth summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching bandwidth summary',
      error: error.message
    });
  }
};
