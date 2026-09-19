const mongoose = require('mongoose');

const campaignSnapshotSchema = new mongoose.Schema({
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true
  },
  status: {
    type: String,
    required: true
  },
  sentCount: {
    type: Number,
    required: true
  },
  failedCount: {
    type: Number,
    required: true
  },
  snapshotAt: {
    type: Date,
    default: Date.now
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

campaignSnapshotSchema.index({ campaignId: 1 });

module.exports = mongoose.model('CampaignSnapshot', campaignSnapshotSchema);
