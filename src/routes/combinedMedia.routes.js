/**
 * Combined Media Routes (Local + API content)
 */

const express = require('express');
const router = express.Router();
const MediaScanner = require('../services/mediaScanner');
const MovieAPI = require('../services/movieAPI');
const config = require('../config');
const { asyncHandler } = require('../middleware/errorHandler');

const mediaScanner = new MediaScanner(config.mediaPath);
const movieAPI = new MovieAPI();

// Get all media (local + API)
router.get('/all', asyncHandler(async (req, res) => {
  const { page = 1, source = 'all', genre } = req.query;
  
  let allMedia = [];
  
  // Get local media
  if (source === 'all' || source === 'local') {
    const localMedia = await mediaScanner.scan();
    allMedia.push(...localMedia);
  }
  
  // Get API content if requested
  if (source === 'all' || source === 'api') {
    try {
      const apiContent = await movieAPI.getFeatured();
      allMedia.push(...apiContent);
    } catch (error) {
      console.warn('API content unavailable:', error.message);
    }
  }

  // Deduplicate media
  const deduplicated = movieAPI.deduplicateMedia(allMedia);

  // Filter by genre if specified
  let filtered = deduplicated;
  if (genre && genre !== 'all') {
    filtered = deduplicated.filter(media => {
      const genres = media.genres || [];
      return genres.some(g => g.toLowerCase() === genre.toLowerCase());
    });
  }

  // Paginate
  const pageNum = parseInt(page);
  const itemsPerPage = 24;
  const start = (pageNum - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const paginated = filtered.slice(start, end);

  res.json({
    results: paginated,
    page: pageNum,
    totalPages: Math.ceil(filtered.length / itemsPerPage),
    totalResults: filtered.length
  });
}));

// Get all available genres
router.get('/genres', asyncHandler(async (req, res) => {
  let allMedia = [];
  
  // Get local media
  const localMedia = await mediaScanner.scan();
  allMedia.push(...localMedia);
  
  // Get API content
  try {
    const apiContent = await movieAPI.getFeatured();
    allMedia.push(...apiContent);
  } catch (error) {
    console.warn('API content unavailable:', error.message);
  }

  // Deduplicate
  const deduplicated = movieAPI.deduplicateMedia(allMedia);

  // Extract all unique genres
  const genreSet = new Set();
  deduplicated.forEach(media => {
    if (media.genres && Array.isArray(media.genres)) {
      media.genres.forEach(genre => {
        if (genre) genreSet.add(genre);
      });
    }
  });

  const genres = Array.from(genreSet).sort();
  res.json({ genres });
}));

module.exports = router;
