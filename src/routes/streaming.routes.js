/**
 * Streaming Routes (Cinetaro, fallback sources)
 */

const express = require('express');
const router = express.Router();
const MovieAPI = require('../services/movieAPI');
const axios = require('axios');
const config = require('../config');
const { asyncHandler } = require('../middleware/errorHandler');

const movieAPI = new MovieAPI();

// Get streaming URL with fallback support
router.get('/:mediaId', asyncHandler(async (req, res) => {
  const { mediaId } = req.params;
  const { type, season = 1, episode = 1, language = 'english', animeType = 'sub', subtitleLang } = req.query;
  
  let id = null;
  let actualType = type;
  let anilistId = null;
  
  if (mediaId.startsWith('tmdb_movie_')) {
    id = mediaId.replace('tmdb_movie_', '');
    actualType = 'movie';
  } else if (mediaId.startsWith('tmdb_tv_')) {
    id = mediaId.replace('tmdb_tv_', '');
    actualType = 'tv';
  } else if (mediaId.startsWith('anime_')) {
    actualType = 'anime';
    anilistId = req.query.anilistId;
    
    if (!anilistId) {
      try {
        const popularAnime = await movieAPI.getPopularAnimeFromJikan(1);
        const anime = popularAnime.find(a => a.id === mediaId);
        if (anime && anime.anilistId) {
          anilistId = anime.anilistId;
        }
      } catch (error) {
        console.warn('Could not fetch anime data for Anilist ID:', error.message);
      }
    }
    
    if (!anilistId) {
      id = mediaId.replace('anime_', '');
      return res.status(400).json({ 
        error: 'Anilist ID not found for this anime. Some anime may not have streaming available yet.' 
      });
    } else {
      id = anilistId;
    }
  }
  
  if (!id) {
    return res.status(400).json({ error: 'Invalid media ID format' });
  }
  
  const streamLanguage = subtitleLang || language;
  const streamingUrl = await movieAPI.getStreamingUrl(id, actualType, {
    season: parseInt(season),
    episode: parseInt(episode),
    language: streamLanguage,
    animeType
  }, true); // checkAvailability = true

  if (!streamingUrl) {
    return res.status(404).json({ error: 'Streaming not available from any source.' });
  }

  res.json({ streamingUrl, type: 'cinetaro', language: streamLanguage });
}));

// Check streaming availability
router.get('/check/:mediaId', asyncHandler(async (req, res) => {
  const { mediaId } = req.params;
  const { type } = req.query;
  
  let id = null;
  let actualType = type;
  
  if (mediaId.startsWith('tmdb_movie_')) {
    id = mediaId.replace('tmdb_movie_', '');
    actualType = 'movie';
  } else if (mediaId.startsWith('tmdb_tv_')) {
    id = mediaId.replace('tmdb_tv_', '');
    actualType = 'tv';
  } else if (mediaId.startsWith('anime_')) {
    return res.json({ available: false, reason: 'Anime availability check requires Anilist ID' });
  }
  
  if (!id) {
    return res.json({ available: false, reason: 'Invalid media ID' });
  }
  
  const available = await movieAPI.checkCinetaroAvailability(id, actualType);
  res.json({ available, mediaId, type: actualType });
}));

module.exports = router;
