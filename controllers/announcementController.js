const Announcement = require('../models/Announcement');

// GET /api/teams/:teamId/announcements
const getAnnouncements = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { priority } = req.query;

    const query = { team: teamId };
    if (priority) query.priority = priority;

    const announcements = await Announcement.find(query)
      .populate('createdBy', 'name email')
      .sort({ isPinned: -1, createdAt: -1 });

    res.json({ success: true, data: announcements });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/teams/:teamId/announcements
const createAnnouncement = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { title, content, priority, isPinned } = req.body;

    const announcement = await Announcement.create({
      team: teamId,
      title,
      content,
      priority: priority || 'medium',
      isPinned: !!isPinned,
      createdBy: req.user._id,
    });

    const populated = await announcement.populate('createdBy', 'name email');
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// PUT /api/teams/:teamId/announcements/:id
const updateAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.findOne({
      _id: req.params.id,
      team: req.params.teamId,
    });
    if (!announcement) return res.status(404).json({ success: false, message: 'Announcement not found' });

    const { title, content, priority, isPinned } = req.body;
    if (title !== undefined) announcement.title = title;
    if (content !== undefined) announcement.content = content;
    if (priority !== undefined) announcement.priority = priority;
    if (isPinned !== undefined) announcement.isPinned = isPinned;

    await announcement.save();
    const updated = await Announcement.findById(announcement._id).populate('createdBy', 'name email');
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// DELETE /api/teams/:teamId/announcements/:id
const deleteAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.findOneAndDelete({
      _id: req.params.id,
      team: req.params.teamId,
    });
    if (!announcement) return res.status(404).json({ success: false, message: 'Announcement not found' });
    res.json({ success: true, message: 'Announcement deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/teams/:teamId/announcements/:id/pin
const togglePin = async (req, res) => {
  try {
    const announcement = await Announcement.findOne({
      _id: req.params.id,
      team: req.params.teamId,
    });
    if (!announcement) return res.status(404).json({ success: false, message: 'Announcement not found' });

    announcement.isPinned = !announcement.isPinned;
    await announcement.save();

    const updated = await Announcement.findById(announcement._id).populate('createdBy', 'name email');
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement, togglePin };
