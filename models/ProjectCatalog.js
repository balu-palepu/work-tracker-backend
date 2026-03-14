const mongoose = require('mongoose');

const projectCatalogSchema = new mongoose.Schema(
  {
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    tagline: {
      type: String,
      trim: true,
      maxlength: [300, 'Tagline cannot exceed 300 characters'],
    },
    status: {
      type: String,
      enum: ['Active', 'Planning', 'On Hold', 'Completed', 'Archived'],
      default: 'Active',
    },
    linkedProject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
    },
    tags: [{ type: String, trim: true }],
    demoUrl: { type: String, trim: true, default: null },
    repoUrl: { type: String, trim: true, default: null },
    onePager: { type: String, default: '' }, // rich HTML content
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

projectCatalogSchema.index({ team: 1, status: 1 });
projectCatalogSchema.index({ team: 1, createdAt: -1 });

module.exports = mongoose.model('ProjectCatalog', projectCatalogSchema);
