const Newsletter = require("../models/Newsletter");
const Project = require("../models/Project");

const canManageNewsletter = (teamMembership, newsletter, userId) => {
  if (!teamMembership || !newsletter || !userId) return false;
  if (teamMembership.role === "admin" || teamMembership.role === "Manager") return true;
  return newsletter.createdBy?.toString() === userId.toString();
};

// @desc    List newsletters for a team
// @route   GET /api/teams/:teamId/newsletters
// @access  Private (team members)
exports.getNewsletters = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      projectId = "",
      search = "",
      tag = "",
    } = req.query;

    const query = { team: req.params.teamId };
    if (projectId) query.project = projectId;
    if (tag) query.tags = tag;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { summary: { $regex: search, $options: "i" } },
      ];
    }

    const [total, newsletters] = await Promise.all([
      Newsletter.countDocuments(query),
      Newsletter.find(query)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        .populate("project", "name")
        .sort({ isPinned: -1, createdAt: -1 })
        .skip((parseInt(page, 10) - 1) * parseInt(limit, 10))
        .limit(parseInt(limit, 10)),
    ]);

    res.json({
      success: true,
      data: newsletters,
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / parseInt(limit, 10)),
    });
  } catch (error) {
    console.error("Get newsletters error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching newsletters",
      error: error.message,
    });
  }
};

// @desc    Get newsletter details
// @route   GET /api/teams/:teamId/newsletters/:newsletterId
// @access  Private (team members)
exports.getNewsletter = async (req, res) => {
  try {
    const newsletter = await Newsletter.findOne({
      _id: req.params.newsletterId,
      team: req.params.teamId,
    })
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .populate("project", "name");

    if (!newsletter) {
      return res.status(404).json({
        success: false,
        message: "Newsletter not found",
      });
    }

    res.json({ success: true, data: newsletter });
  } catch (error) {
    console.error("Get newsletter error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching newsletter",
      error: error.message,
    });
  }
};

// @desc    Create newsletter
// @route   POST /api/teams/:teamId/newsletters
// @access  Private (team members)
exports.createNewsletter = async (req, res) => {
  try {
    const { title, summary = "", content, project = null, tags = [], isPinned = false } = req.body;

    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Title and content are required",
      });
    }

    if (project) {
      const projectExists = await Project.exists({
        _id: project,
        team: req.params.teamId,
      });
      if (!projectExists) {
        return res.status(400).json({
          success: false,
          message: "Project does not belong to this team",
        });
      }
    }

    const newsletter = await Newsletter.create({
      team: req.params.teamId,
      project: project || null,
      title: title.trim(),
      summary: summary?.trim() || "",
      content,
      tags: Array.isArray(tags) ? tags : [],
      isPinned: Boolean(isPinned),
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    const populated = await Newsletter.findById(newsletter._id)
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .populate("project", "name");

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    console.error("Create newsletter error:", error);
    res.status(400).json({
      success: false,
      message: "Error creating newsletter",
      error: error.message,
    });
  }
};

// @desc    Update newsletter
// @route   PUT /api/teams/:teamId/newsletters/:newsletterId
// @access  Private (creator/admin/Manager)
exports.updateNewsletter = async (req, res) => {
  try {
    const newsletter = await Newsletter.findOne({
      _id: req.params.newsletterId,
      team: req.params.teamId,
    });

    if (!newsletter) {
      return res.status(404).json({
        success: false,
        message: "Newsletter not found",
      });
    }

    if (!canManageNewsletter(req.teamMembership, newsletter, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "Only the creator, admin, or manager can update this newsletter",
      });
    }

    const updates = { ...req.body, updatedBy: req.user._id };
    if (Object.prototype.hasOwnProperty.call(updates, "title")) {
      updates.title = updates.title?.trim();
    }
    if (Object.prototype.hasOwnProperty.call(updates, "summary")) {
      updates.summary = updates.summary?.trim();
    }

    if (Object.prototype.hasOwnProperty.call(updates, "project") && updates.project) {
      const projectExists = await Project.exists({
        _id: updates.project,
        team: req.params.teamId,
      });
      if (!projectExists) {
        return res.status(400).json({
          success: false,
          message: "Project does not belong to this team",
        });
      }
    }

    const updated = await Newsletter.findByIdAndUpdate(
      newsletter._id,
      updates,
      { new: true, runValidators: true },
    )
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .populate("project", "name");

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error("Update newsletter error:", error);
    res.status(400).json({
      success: false,
      message: "Error updating newsletter",
      error: error.message,
    });
  }
};

// @desc    Delete newsletter
// @route   DELETE /api/teams/:teamId/newsletters/:newsletterId
// @access  Private (creator/admin/Manager)
exports.deleteNewsletter = async (req, res) => {
  try {
    const newsletter = await Newsletter.findOne({
      _id: req.params.newsletterId,
      team: req.params.teamId,
    });

    if (!newsletter) {
      return res.status(404).json({
        success: false,
        message: "Newsletter not found",
      });
    }

    if (!canManageNewsletter(req.teamMembership, newsletter, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "Only the creator, admin, or manager can delete this newsletter",
      });
    }

    await newsletter.deleteOne();
    res.json({ success: true, message: "Newsletter deleted successfully" });
  } catch (error) {
    console.error("Delete newsletter error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting newsletter",
      error: error.message,
    });
  }
};
