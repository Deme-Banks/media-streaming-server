/**
 * Search Routes
 */

const express = require('express');
const router = express.Router();
const MovieAPI = require('../services/movieAPI');
const { asyncHandler } = require('../middleware/errorHandler');

const movieAPI = new MovieAPI();

// Universal search across all APIs
router.get('/', asyncHandler(async (req, res) => {
  const { q, page = 1, movies = '1', tv = '1', anime = '1', limit } = req.query;
  
  if (!q) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  // Use universal search method
  // Note: universalSearch only accepts query and page, so we'll search all types
  // and filter manually if needed
  const allResults = await movieAPI.universalSearch(q, parseInt(page));
  
  // Filter by type if specified
  let results = allResults;
  if (movies === '0') {
    results = results.filter(r => r.type !== 'movie');
  }
  if (tv === '0') {
    results = results.filter(r => r.type !== 'tv');
  }
  if (anime === '0') {
    results = results.filter(r => r.type !== 'anime');
  }
  
  // Apply limit if specified
  if (limit) {
    results = results.slice(0, parseInt(limit));
  }

  res.json(results);
}));

module.exports = router;
