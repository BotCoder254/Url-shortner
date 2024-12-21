const mongoose = require('mongoose');

const urlSchema = new mongoose.Schema({
  originalUrl: {
    type: String,
    required: true,
  },
  shortUrl: {
    type: String,
    required: true,
    unique: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  clicks: {
    type: Number,
    default: 0,
  },
  lastClickedAt: {
    type: Date,
  },
  expiresAt: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  analytics: [{
    timestamp: {
      type: Date,
      default: Date.now,
    },
    visits: {
      type: Number,
      default: 1,
    },
    referrer: String,
    userAgent: String,
  }],
});

// Add index for better query performance
urlSchema.index({ user: 1, createdAt: -1 });
urlSchema.index({ shortUrl: 1 });

module.exports = mongoose.model('Url', urlSchema);
