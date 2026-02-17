const mongoose = require("mongoose");

const newsletterSchema = new mongoose.Schema(
  {
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
      index: true,
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    summary: {
      type: String,
      trim: true,
      maxlength: [500, "Summary cannot exceed 500 characters"],
      default: "",
    },
    content: {
      type: String,
      required: [true, "Content is required"],
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    isPinned: {
      type: Boolean,
      default: false,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

newsletterSchema.index({ team: 1, createdAt: -1 });
newsletterSchema.index({ team: 1, project: 1, createdAt: -1 });

newsletterSchema.set("toJSON", {
  virtuals: true,
  transform: function transform(doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Newsletter", newsletterSchema);
