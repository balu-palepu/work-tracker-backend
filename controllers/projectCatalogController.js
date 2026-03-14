const ProjectCatalog = require('../models/ProjectCatalog');

// GET /api/teams/:teamId/catalog
const getCatalog = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { status, search } = req.query;

    const query = { team: teamId };
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { tagline: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } },
      ];
    }

    const entries = await ProjectCatalog.find(query)
      .populate('linkedProject', 'name color')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: entries });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/teams/:teamId/catalog/:id
const getCatalogEntry = async (req, res) => {
  try {
    const entry = await ProjectCatalog.findOne({
      _id: req.params.id,
      team: req.params.teamId,
    })
      .populate('linkedProject', 'name color')
      .populate('createdBy', 'name email');

    if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' });
    res.json({ success: true, data: entry });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/teams/:teamId/catalog
const createCatalogEntry = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { title, tagline, status, linkedProject, tags, demoUrl, repoUrl, onePager } = req.body;

    const entry = await ProjectCatalog.create({
      team: teamId,
      title,
      tagline,
      status,
      linkedProject: linkedProject || null,
      tags: tags || [],
      demoUrl: demoUrl || null,
      repoUrl: repoUrl || null,
      onePager: onePager || '',
      createdBy: req.user._id,
    });

    const populated = await entry.populate([
      { path: 'linkedProject', select: 'name color' },
      { path: 'createdBy', select: 'name email' },
    ]);

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// PUT /api/teams/:teamId/catalog/:id
const updateCatalogEntry = async (req, res) => {
  try {
    const entry = await ProjectCatalog.findOne({
      _id: req.params.id,
      team: req.params.teamId,
    });
    if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' });

    const allowed = ['title', 'tagline', 'status', 'linkedProject', 'tags', 'demoUrl', 'repoUrl', 'onePager'];
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) entry[field] = req.body[field];
    });

    await entry.save();

    const updated = await ProjectCatalog.findById(entry._id)
      .populate('linkedProject', 'name color')
      .populate('createdBy', 'name email');

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// DELETE /api/teams/:teamId/catalog/:id
const deleteCatalogEntry = async (req, res) => {
  try {
    const entry = await ProjectCatalog.findOneAndDelete({
      _id: req.params.id,
      team: req.params.teamId,
    });
    if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' });
    res.json({ success: true, message: 'Entry deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getCatalog, getCatalogEntry, createCatalogEntry, updateCatalogEntry, deleteCatalogEntry };
