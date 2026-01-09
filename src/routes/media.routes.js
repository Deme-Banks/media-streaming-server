/**
 * Media Routes (Local Media Files)
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs-extra');
const MediaScanner = require('../services/mediaScanner');
const MediaStreamer = require('../services/mediaStreamer');
const config = require('../config');
const { asyncHandler } = require('../middleware/errorHandler');

const mediaScanner = new MediaScanner(config.mediaPath);
const mediaStreamer = new MediaStreamer(config.mediaPath);

// Get all media files
router.get('/', asyncHandler(async (req, res) => {
  const media = await mediaScanner.scan();
  res.json(media);
}));

// Get media metadata (local files only)
// Note: This must come after /all, /genres, and /:mediaId/details routes
router.get('/:id', asyncHandler(async (req, res) => {
  // Skip if this is actually a combined media route
  if (req.params.id === 'all' || req.params.id === 'genres') {
    return res.status(404).json({ error: 'Media not found' });
  }
  
  const { id } = req.params;
  const metadata = await mediaScanner.getMetadata(id);
  if (!metadata) {
    return res.status(404).json({ error: 'Media not found' });
  }
  res.json(metadata);
}));

// Note: /api/stream/:id and /api/thumbnail/:id are handled directly in server.js
// to avoid route conflicts with /api/media/:id

module.exports = router;
