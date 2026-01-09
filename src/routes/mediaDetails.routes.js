/**
 * Media Details Routes (Enriched with OMDb)
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const MovieAPI = require('../services/movieAPI');
const config = require('../config');
const { asyncHandler } = require('../middleware/errorHandler');

const movieAPI = new MovieAPI();

// Get enriched media details (TMDB + OMDb)
router.get('/:mediaId/details', asyncHandler(async (req, res) => {
  const { mediaId } = req.params;
  
  let id = null;
  let type = null;
  let tmdbItem = null;
  
  if (mediaId.startsWith('tmdb_movie_')) {
    id = mediaId.replace('tmdb_movie_', '');
    type = 'movie';
    
    if (config.tmdbApiKey) {
      const response = await axios.get(`https://api.themoviedb.org/3/movie/${id}`, {
        params: {
          api_key: config.tmdbApiKey,
          language: 'en-US',
          append_to_response: 'videos,credits,external_ids'
        },
        timeout: 10000
      });
      
      const item = response.data;
      tmdbItem = {
        id: `tmdb_movie_${item.id}`,
        title: item.title,
        originalTitle: item.original_title,
        overview: item.overview,
        releaseDate: item.release_date,
        year: item.release_date ? item.release_date.split('-')[0] : null,
        posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
        backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
        rating: item.vote_average,
        popularity: item.popularity,
        type: 'movie',
        source: 'tmdb',
        tmdbId: item.id,
        genres: item.genres ? item.genres.map(g => g.name) : [],
        director: item.credits?.crew?.find(c => c.job === 'Director')?.name || null,
        actors: item.credits?.cast?.slice(0, 10).map(c => c.name).join(', ') || null,
        runtime: item.runtime ? `${item.runtime} min` : null,
        imdbId: item.external_ids?.imdb_id || null
      };
    }
  } else if (mediaId.startsWith('tmdb_tv_')) {
    id = mediaId.replace('tmdb_tv_', '');
    type = 'tv';
    
    if (config.tmdbApiKey) {
      const response = await axios.get(`https://api.themoviedb.org/3/tv/${id}`, {
        params: {
          api_key: config.tmdbApiKey,
          language: 'en-US',
          append_to_response: 'external_ids'
        },
        timeout: 10000
      });
      
      const item = response.data;
      tmdbItem = {
        id: `tmdb_tv_${item.id}`,
        title: item.name,
        originalTitle: item.original_name,
        overview: item.overview,
        releaseDate: item.first_air_date,
        year: item.first_air_date ? item.first_air_date.split('-')[0] : null,
        posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
        backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
        rating: item.vote_average,
        popularity: item.popularity,
        type: 'tv',
        source: 'tmdb',
        tmdbId: item.id,
        genres: item.genres ? item.genres.map(g => g.name) : [],
        runtime: item.episode_run_time?.[0] ? `${item.episode_run_time[0]} min` : null,
        imdbId: item.external_ids?.imdb_id || null
      };
    }
  }
  
  if (!tmdbItem) {
    return res.status(404).json({ error: 'Media not found' });
  }
  
  // Enrich with OMDb data if available
  let enrichedItem = tmdbItem;
  if (config.omdbApiKey) {
    try {
      if (tmdbItem.imdbId) {
        const omdbData = await movieAPI.getMovieFromOMDb(tmdbItem.imdbId);
        if (omdbData) {
          enrichedItem = {
            ...tmdbItem,
            imdbRating: omdbData.imdbRating || tmdbItem.rating,
            metascore: omdbData.metascore,
            omdbRatings: omdbData.ratings || {},
            director: omdbData.director || tmdbItem.director,
            writer: omdbData.writer || tmdbItem.writer,
            actors: omdbData.actors || tmdbItem.actors,
            awards: omdbData.awards,
            boxOffice: omdbData.boxOffice,
            rated: omdbData.rated || tmdbItem.rated,
            runtime: omdbData.runtime || tmdbItem.runtime,
            country: omdbData.country || tmdbItem.country,
            language: omdbData.language || tmdbItem.language,
            posterUrl: tmdbItem.posterUrl || omdbData.posterUrl,
            overview: (omdbData.overview && omdbData.overview.length > (tmdbItem.overview?.length || 0)) 
              ? omdbData.overview 
              : (tmdbItem.overview || omdbData.overview),
            genres: [...new Set([...(tmdbItem.genres || []), ...(omdbData.genres || [])])],
            enrichedWithOMDb: true
          };
        }
      } else if (tmdbItem.title && tmdbItem.year) {
        enrichedItem = await movieAPI.enrichWithOMDb(tmdbItem);
      }
    } catch (error) {
      console.warn('Error enriching with OMDb:', error.message);
    }
  }
  
  res.json(enrichedItem);
}));

module.exports = router;
