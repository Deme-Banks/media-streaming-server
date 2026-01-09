/**
 * TV Show Routes (Seasons, Episodes, Details)
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const MovieAPI = require('../services/movieAPI');
const config = require('../config');
const { asyncHandler } = require('../middleware/errorHandler');

const movieAPI = new MovieAPI();

// Get TV show details (seasons and episodes)
router.get('/:tvId/details', asyncHandler(async (req, res) => {
  const { tvId } = req.params;
  const id = tvId.replace('tmdb_tv_', '');
  
  if (!config.tmdbApiKey) {
    return res.status(400).json({ error: 'TMDB API key not configured' });
  }
  
  const response = await axios.get(`https://api.themoviedb.org/3/tv/${id}`, {
    params: {
      api_key: config.tmdbApiKey,
      language: 'en-US',
      append_to_response: 'episode_groups'
    },
    timeout: 10000
  });
  
  const tvShow = response.data;
  const seasons = (tvShow.seasons || []).filter(s => s.season_number >= 0).map(season => ({
    seasonNumber: season.season_number,
    name: season.name || `Season ${season.season_number}`,
    episodeCount: season.episode_count,
    overview: season.overview,
    posterPath: season.poster_path
  }));
  
  res.json({
    id: tvShow.id,
    name: tvShow.name,
    overview: tvShow.overview,
    posterPath: tvShow.poster_path,
    backdropPath: tvShow.backdrop_path,
    totalSeasons: tvShow.number_of_seasons,
    totalEpisodes: tvShow.number_of_episodes,
    seasons: seasons
  });
}));

// Get episodes for a specific season
router.get('/:tvId/season/:seasonNumber', asyncHandler(async (req, res) => {
  const { tvId, seasonNumber } = req.params;
  const id = tvId.replace('tmdb_tv_', '');
  
  if (!config.tmdbApiKey) {
    return res.status(400).json({ error: 'TMDB API key not configured' });
  }
  
  const response = await axios.get(`https://api.themoviedb.org/3/tv/${id}/season/${seasonNumber}`, {
    params: {
      api_key: config.tmdbApiKey,
      language: 'en-US'
    },
    timeout: 10000
  });
  
  const season = response.data;
  const episodes = (season.episodes || []).map(ep => ({
    episodeNumber: ep.episode_number,
    name: ep.name || `Episode ${ep.episode_number}`,
    overview: ep.overview,
    airDate: ep.air_date,
    stillPath: ep.still_path,
    runtime: ep.runtime
  }));
  
  res.json({
    seasonNumber: season.season_number,
    name: season.name,
    overview: season.overview,
    episodes: episodes
  });
}));

module.exports = router;
