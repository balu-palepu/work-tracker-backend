const express = require('express');
const router = express.Router();
const Activity = require('../models/Activity');
const { protect } = require('../middleware/auth');

// All routes are protected
router.use(protect);

// @route   POST /api/activities
// @desc    Create a new activity
// @access  Private
router.post('/', async (req, res) => {
  try {
    const activityData = {
      ...req.body,
      user: req.user._id
    };

    const activity = await Activity.create(activityData);

    res.status(201).json({
      success: true,
      message: 'Activity created successfully',
      data: activity
    });
  } catch (error) {
    console.error('Create activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating activity'
    });
  }
});

// @route   GET /api/activities
// @desc    Get all activities for current user
// @access  Private
router.get('/', async (req, res) => {
  try {
    const { startDate, endDate, limit = 50, page = 1 } = req.query;

    const query = { user: req.user._id };

    // Filter by date range if provided
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const activities = await Activity.find(query)
      .sort({ date: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Activity.countDocuments(query);

    res.json({
      success: true,
      count: activities.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: activities
    });
  } catch (error) {
    console.error('Get activities error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching activities'
    });
  }
});

// @route   GET /api/activities/:id
// @desc    Get single activity
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const activity = await Activity.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!activity) {
      return res.status(404).json({
        success: false,
        message: 'Activity not found'
      });
    }

    res.json({
      success: true,
      data: activity
    });
  } catch (error) {
    console.error('Get activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching activity'
    });
  }
});

// @route   GET /api/activities/date/:date
// @desc    Get activity by specific date
// @access  Private
router.get('/date/:date', async (req, res) => {
  try {
    const targetDate = new Date(req.params.date);
    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

    const activity = await Activity.findOne({
      user: req.user._id,
      date: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    });

    res.json({
      success: true,
      data: activity
    });
  } catch (error) {
    console.error('Get activity by date error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching activity'
    });
  }
});

// @route   PUT /api/activities/:id
// @desc    Update activity
// @access  Private
router.put('/:id', async (req, res) => {
  try {
    const activity = await Activity.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!activity) {
      return res.status(404).json({
        success: false,
        message: 'Activity not found'
      });
    }

    //update allowed fields
    if (req.body.meetings !== undefined) {
      activity.meetings = req.body.meetings;
    }

    if (req.body.tasks !== undefined) {
      activity.tasks = req.body.tasks;
    }

    if (req.body.extraActivities !== undefined) {
      activity.extraActivities = req.body.extraActivities;
    }

    if (req.body.notes !== undefined) {
      activity.notes = req.body.notes;
    }

    if (req.body.mood !== undefined) {
      activity.mood = req.body.mood;
    }

    if (req.body.productivity !== undefined) {
      activity.productivity = req.body.productivity;
    }

    //This is the key
    await activity.save(); 

    res.json({
      success: true,
      message: 'Activity updated successfully',
      data: activity
    });
  } catch (error) {
    console.error('Update activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating activity'
    });
  }
});


// @route   DELETE /api/activities/:id
// @desc    Delete activity
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const activity = await Activity.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!activity) {
      return res.status(404).json({
        success: false,
        message: 'Activity not found'
      });
    }

    await Activity.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Activity deleted successfully'
    });
  } catch (error) {
    console.error('Delete activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting activity'
    });
  }
});

// @route   GET /api/activities/stats/summary
// @desc    Get user statistics
// @access  Private
router.get('/stats/summary', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate) : new Date();

    const stats = await Activity.getUserStats(req.user._id, start, end);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics'
    });
  }
});

module.exports = router;
