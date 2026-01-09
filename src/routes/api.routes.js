/**
 * API Content Routes (TMDB, Jikan, AniList, TVMaze, etc.)
 * Handles bulk loading, popular content, featured content
 */

const express = require('express');
const router = express.Router();
const MovieAPI = require('../services/movieAPI');
const { asyncHandler } = require('../middleware/errorHandler');

const movieAPI = new MovieAPI();

// Helper function for bulk loading with batch processing
async function bulkLoad(endpoints, startPage, pageCount, batchSize = 2, delay = 100) {
  const allItems = [];
  const endPage = startPage + pageCount - 1;

  for (const endpoint of endpoints) {
    try {
      const endpointItems = [];
      for (let batchStart = startPage; batchStart <= endPage; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize - 1, endPage);
        const batchPromises = [];

        for (let i = batchStart; i <= batchEnd; i++) {
          batchPromises.push(
            endpoint.method(i).catch(error => {
              console.warn(`[${endpoint.name}] Error loading page ${i}:`, error.message);
              return [];
            })
          );
        }

        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(items => endpointItems.push(...items));

        if (batchEnd < endPage) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      allItems.push(...endpointItems);
      console.log(`[${endpoint.name}] Loaded ${endpointItems.length} items (pages ${startPage}-${endPage})`);
    } catch (error) {
      console.warn(`[${endpoint.name}] Error loading:`, error.message);
    }
  }

  return allItems;
}

// Get featured content
router.get('/featured', asyncHandler(async (req, res) => {
  const featured = await movieAPI.getFeatured();
  res.json(featured);
}));

// Get popular movies
router.get('/popular/movies', asyncHandler(async (req, res) => {
  const { page = 1 } = req.query;
  const movies = await movieAPI.getPopularMovies(parseInt(page));
  console.log(`[TMDB] Loaded ${movies.length} popular movies from page ${page}`);
  res.json(movies);
}));

// Get bulk movies
router.get('/bulk/movies', asyncHandler(async (req, res) => {
  const { pages = 20, start = 1 } = req.query;
  const startPage = parseInt(start);
  const pageCount = Math.min(parseInt(pages), 20);

  const endpoints = [
    { name: 'popular', method: (p) => movieAPI.getPopularMovies(p) },
    { name: 'trending', method: (p) => movieAPI.getTrendingMovies(p) },
    { name: 'top_rated', method: (p) => movieAPI.getTopRatedMovies(p) },
    { name: 'now_playing', method: (p) => movieAPI.getNowPlayingMovies(p) },
    { name: 'upcoming', method: (p) => movieAPI.getUpcomingMovies(p) }
  ];

  const allMovies = await bulkLoad(endpoints, startPage, pageCount, 2, 100);

  // Deduplicate by TMDB ID
  const seen = new Map();
  const uniqueMovies = allMovies.filter(movie => {
    const key = `${movie.tmdbId || movie.id}`;
    if (!seen.has(key)) {
      seen.set(key, true);
      return true;
    }
    return false;
  });

  console.log(`[TMDB] Bulk load complete: ${uniqueMovies.length} unique movies`);
  res.json(uniqueMovies);
}));

// Get popular TV shows
router.get('/popular/tv', asyncHandler(async (req, res) => {
  const { page = 1 } = req.query;
  const tvShows = await movieAPI.getPopularTVShows(parseInt(page));
  console.log(`[TMDB] Loaded ${tvShows.length} popular TV shows from page ${page}`);
  res.json(tvShows);
}));

// Get bulk TV shows
router.get('/bulk/tv', asyncHandler(async (req, res) => {
  const { pages = 20, start = 1 } = req.query;
  const startPage = parseInt(start);
  const pageCount = Math.min(parseInt(pages), 20);

  const endpoints = [
    { name: 'tmdb_popular', method: (p) => movieAPI.getPopularTVShows(p) },
    { name: 'tmdb_top_rated', method: (p) => movieAPI.getTopRatedTVShows(p) },
    { name: 'tvmaze', method: (p) => movieAPI.getPopularTVShowsFromTVMaze(p) }
  ];

  const allShows = await bulkLoad(endpoints, startPage, pageCount, 2, 150);
  const uniqueShows = movieAPI.deduplicateMedia(allShows);

  console.log(`[TV] Bulk load complete: ${uniqueShows.length} unique TV shows`);
  res.json(uniqueShows);
}));

// Get popular anime
router.get('/popular/anime', asyncHandler(async (req, res) => {
  const { page = 1 } = req.query;
  // Combine Jikan and AniList results
  const [jikanAnime, anilistAnime] = await Promise.all([
    movieAPI.getPopularAnimeFromJikan(parseInt(page)).catch(() => []),
    movieAPI.getPopularAnimeFromAniList(parseInt(page)).catch(() => [])
  ]);
  const combined = [...jikanAnime, ...anilistAnime];
  const uniqueAnime = movieAPI.deduplicateMedia(combined);
  res.json(uniqueAnime);
}));

// Get bulk anime
router.get('/bulk/anime', asyncHandler(async (req, res) => {
  const { pages = 20, start = 1 } = req.query;
  const startPage = parseInt(start);
  const pageCount = Math.min(parseInt(pages), 20);

  const apis = [
    { name: 'jikan', method: (p) => movieAPI.getPopularAnimeFromJikan(p) },
    { name: 'anilist', method: (p) => movieAPI.getPopularAnimeFromAniList(p) }
  ];

  const allAnime = await bulkLoad(apis, startPage, pageCount, 2, 200);
  const uniqueAnime = movieAPI.deduplicateMedia(allAnime);

  console.log(`[Anime] Bulk load complete: ${uniqueAnime.length} unique anime`);
  res.json(uniqueAnime);
}));

// Get cartoons
router.get('/cartoons', asyncHandler(async (req, res) => {
  const { page = 1 } = req.query;
  const cartoons = await movieAPI.getCartoons(parseInt(page));
  console.log(`[Cartoons] Loaded ${cartoons.length} cartoons`);
  res.json(cartoons);
}));

// Get bulk cartoons
router.get('/bulk/cartoons', asyncHandler(async (req, res) => {
  const { pages = 10, start = 1 } = req.query;
  const startPage = parseInt(start);
  const pageCount = Math.min(parseInt(pages), 20);

  const cartoonFetchers = [
    { name: 'tmdb_animation_movies', method: (p) => movieAPI.getMoviesByGenre(16, p) },
    { name: 'tmdb_animation_tv', method: (p) => movieAPI.getTVShowsByGenre(16, p) },
    { name: 'tmdb_top_animation_movies', method: (p) => movieAPI.getTopRatedAnimationMovies(p) },
    { name: 'tmdb_top_animation_tv', method: (p) => movieAPI.getTopRatedAnimationTV(p) },
    { name: 'anilist', method: (p) => movieAPI.getPopularAnimeFromAniList(p) }
  ];

  const allCartoons = await bulkLoad(cartoonFetchers, startPage, pageCount, 3, 100);

  // Deduplicate and filter
  const deduplicated = movieAPI.deduplicateMedia(allCartoons).filter(item =>
    item && item.title && (item.posterUrl || item.backdropUrl)
  );

  console.log(`[Cartoons] Bulk load complete: ${deduplicated.length} unique cartoons`);
  res.json(deduplicated);
}));

// Get genres - returns genre map from TMDB
router.get('/genres', asyncHandler(async (req, res) => {
  // Wait for genres to be initialized if needed
  await movieAPI.initGenres();
  const genres = {
    movie: movieAPI.genreMap.movie || {},
    tv: movieAPI.genreMap.tv || {}
  };
  
  // Convert to array format for easier consumption
  const movieGenres = Object.values(genres.movie);
  const tvGenres = Object.values(genres.tv);
  const allGenres = [...new Set([...movieGenres, ...tvGenres])].sort();
  
  res.json({ genres: allGenres, movieGenres, tvGenres });
}));

// Get media/all (combined local + API)
router.get('/media/all', asyncHandler(async (req, res) => {
  // This will be handled by a separate route that combines local and API media
  // For now, return API-only
  const { genre, type } = req.query;
  
  // This is a simplified version - full implementation in separate route
  res.json([]);
}));

module.exports = router;
