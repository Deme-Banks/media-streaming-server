/**
 * Watch History Routes
 */

const express = require('express');
const router = express.Router();
const WatchHistoryService = require('../services/watchHistoryService');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const path = require('path');
const fs = require('fs-extra');

// Get watch history
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.session.userId;
  const history = await WatchHistoryService.getHistory(userId);
  res.json(history);
}));

// Get continue watching
router.get('/continue-watching', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.session.userId;
  const continueWatching = await WatchHistoryService.getContinueWatching(userId);
  res.json(continueWatching);
}));

// Get resume position
router.get('/resume/:mediaId', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.session.userId;
  const { mediaId } = req.params;
  const resume = await WatchHistoryService.getResumePosition(userId, mediaId);
  res.json(resume || { position: 0, progress: 0 });
}));

// Update watch history
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.session.userId;
  const { mediaId, mediaType, position, duration } = req.body;
  
  if (!mediaId || !mediaType) {
    return res.status(400).json({ error: 'mediaId and mediaType are required' });
  }
  
  const entry = await WatchHistoryService.addHistory(userId, mediaId, mediaType, position || 0, duration || 0);
  res.json(entry);
}));

// Report non-streamable
router.post('/report-non-streamable', requireAuth, asyncHandler(async (req, res) => {
  const { mediaId } = req.body;
  if (!mediaId) return res.status(400).json({ error: 'mediaId is required' });
  
  const reportsFile = path.join(__dirname, '../../.data', 'nonStreamableReports.json');
  await fs.ensureDir(path.dirname(reportsFile));
  
  let reports = [];
  if (await fs.pathExists(reportsFile)) {
    reports = await fs.readJson(reportsFile);
  }
  
  if (!reports.find(r => r.mediaId === mediaId)) {
    reports.push({ 
      mediaId, 
      reportedAt: new Date().toISOString(), 
      reportedBy: req.session.userId 
    });
    await fs.writeJson(reportsFile, reports, { spaces: 2 });
  }
  
  res.json({ success: true });
}));

module.exports = router;
