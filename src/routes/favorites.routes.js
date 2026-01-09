/**
 * Favorites Routes
 */

const express = require('express');
const router = express.Router();
const FavoritesService = require('../services/favoritesService');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const favoritesService = new FavoritesService();

// Get user's favorites
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const favorites = await favoritesService.getUserFavorites(req.session.userId);
  res.json(favorites);
}));

// Add to favorites
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { mediaId, ...mediaData } = req.body;

  if (!mediaId) {
    return res.status(400).json({ error: 'Media ID is required' });
  }

  const favorite = await favoritesService.addFavorite(req.session.userId, mediaId, mediaData);
  res.status(201).json({ message: 'Added to favorites', favorite });
}));

// Remove from favorites
router.delete('/:mediaId', requireAuth, asyncHandler(async (req, res) => {
  const { mediaId } = req.params;
  const removed = await favoritesService.removeFavorite(req.session.userId, mediaId);

  if (removed) {
    res.json({ message: 'Removed from favorites' });
  } else {
    res.status(404).json({ error: 'Favorite not found' });
  }
}));

// Check if item is favorited
router.get('/:mediaId', requireAuth, asyncHandler(async (req, res) => {
  const { mediaId } = req.params;
  const isFavorited = await favoritesService.isFavorited(req.session.userId, mediaId);
  res.json({ isFavorited });
}));

module.exports = router;
