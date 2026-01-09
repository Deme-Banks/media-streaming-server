require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const session = require('express-session');
const axios = require('axios');

const MediaScanner = require('./src/services/mediaScanner');
const MediaStreamer = require('./src/services/mediaStreamer');
const MovieAPI = require('./src/services/movieAPI');
const UserService = require('./src/services/userService');
const FavoritesService = require('./src/services/favoritesService');
const WatchHistoryService = require('./src/services/watchHistoryService');
const RecommendationsService = require('./src/services/recommendationsService');
const CollectionsService = require('./src/services/collectionsService');

const app = express();
const PORT = process.env.PORT || 3000;
const MEDIA_PATH = process.env.MEDIA_PATH || path.join(__dirname, 'media');

// Middleware - CORS configured to allow all origins for network access
app.use(cors({
  origin: true, // Allow all origins (for local network access)
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'deme-movies-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if using HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize services
const mediaScanner = new MediaScanner(MEDIA_PATH);
const mediaStreamer = new MediaStreamer(MEDIA_PATH);
const movieAPI = new MovieAPI();
const userService = new UserService();
const favoritesService = new FavoritesService();

// Ensure media directory exists
fs.ensureDirSync(MEDIA_PATH);

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required' });
};

// API Routes

// ========== Authentication Routes ==========

// Register new user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, displayName } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    const user = await userService.register(username, password, displayName);
    req.session.userId = user.id;
    req.session.username = user.username;

    res.status(201).json({ message: 'User registered successfully', user });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({ error: error.message || 'Registration failed' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await userService.authenticate(username, password);
    req.session.userId = user.id;
    req.session.username = user.username;

    res.json({ message: 'Login successful', user });
  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({ error: error.message || 'Invalid credentials' });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logout successful' });
  });
});

// Get current user
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await userService.getUserById(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Get all users (admin or household members list)
app.get('/api/users', requireAuth, async (req, res) => {
  try {
    const users = await userService.getAllUsers();
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// ========== Watch History Routes ==========

// Get watch history
app.get('/api/watch-history', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const history = await WatchHistoryService.getHistory(userId);
    res.json(history);
  } catch (error) {
    console.error('Error getting watch history:', error);
    res.status(500).json({ error: 'Failed to get watch history' });
  }
});

// Get continue watching
app.get('/api/continue-watching', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const continueWatching = await WatchHistoryService.getContinueWatching(userId);
    res.json(continueWatching);
  } catch (error) {
    console.error('Error getting continue watching:', error);
    res.status(500).json({ error: 'Failed to get continue watching' });
  }
});

// Get resume position
app.get('/api/resume/:mediaId', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { mediaId } = req.params;
    const resume = await WatchHistoryService.getResumePosition(userId, mediaId);
    res.json(resume || { position: 0, progress: 0 });
  } catch (error) {
    console.error('Error getting resume position:', error);
    res.status(500).json({ error: 'Failed to get resume position' });
  }
});

// Update watch history
app.post('/api/watch-history', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { mediaId, mediaType, position, duration } = req.body;
    if (!mediaId || !mediaType) {
      return res.status(400).json({ error: 'mediaId and mediaType are required' });
    }
    const entry = await WatchHistoryService.addHistory(userId, mediaId, mediaType, position || 0, duration || 0);
    res.json(entry);
  } catch (error) {
    console.error('Error updating watch history:', error);
    res.status(500).json({ error: 'Failed to update watch history' });
  }
});

// Report non-streamable
app.post('/api/report-non-streamable', requireAuth, async (req, res) => {
  try {
    const { mediaId } = req.body;
    if (!mediaId) return res.status(400).json({ error: 'mediaId is required' });
    const reportsFile = path.join(__dirname, '.data', 'nonStreamableReports.json');
    await fs.ensureDir(path.dirname(reportsFile));
    let reports = [];
    if (await fs.pathExists(reportsFile)) {
      reports = await fs.readJson(reportsFile);
    }
    if (!reports.find(r => r.mediaId === mediaId)) {
      reports.push({ mediaId, reportedAt: new Date().toISOString(), reportedBy: req.session.userId });
      await fs.writeJson(reportsFile, reports, { spaces: 2 });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error reporting:', error);
    res.status(500).json({ error: 'Failed to report' });
  }
});

// ========== Favorites Routes ==========

// Get user's favorites
app.get('/api/favorites', requireAuth, async (req, res) => {
  try {
    const favorites = await favoritesService.getUserFavorites(req.session.userId);
    res.json(favorites);
  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({ error: 'Failed to get favorites' });
  }
});

// Add to favorites
app.post('/api/favorites', requireAuth, async (req, res) => {
  try {
    const { mediaId, ...mediaData } = req.body;

    if (!mediaId) {
      return res.status(400).json({ error: 'Media ID is required' });
    }

    const favorite = await favoritesService.addFavorite(req.session.userId, mediaId, mediaData);
    res.status(201).json({ message: 'Added to favorites', favorite });
  } catch (error) {
    console.error('Add favorite error:', error);
    res.status(500).json({ error: 'Failed to add favorite' });
  }
});

// Remove from favorites
app.delete('/api/favorites/:mediaId', requireAuth, async (req, res) => {
  try {
    const { mediaId } = req.params;
    const removed = await favoritesService.removeFavorite(req.session.userId, mediaId);

    if (removed) {
      res.json({ message: 'Removed from favorites' });
    } else {
      res.status(404).json({ error: 'Favorite not found' });
    }
  } catch (error) {
    console.error('Remove favorite error:', error);
    res.status(500).json({ error: 'Failed to remove favorite' });
  }
});

// Check if item is favorited
app.get('/api/favorites/:mediaId', requireAuth, async (req, res) => {
  try {
    const { mediaId } = req.params;
    const isFavorited = await favoritesService.isFavorited(req.session.userId, mediaId);
    res.json({ isFavorited });
  } catch (error) {
    console.error('Check favorite error:', error);
    res.status(500).json({ error: 'Failed to check favorite' });
  }
});

// ========== Media Routes ==========

// Get all media files
app.get('/api/media', async (req, res) => {
  try {
    const media = await mediaScanner.scan();
    res.json(media);
  } catch (error) {
    console.error('Error scanning media:', error);
    res.status(500).json({ error: 'Failed to scan media library' });
  }
});

// Get media metadata
app.get('/api/media/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const metadata = await mediaScanner.getMetadata(id);
    if (!metadata) {
      return res.status(404).json({ error: 'Media not found' });
    }
    res.json(metadata);
  } catch (error) {
    console.error('Error getting metadata:', error);
    res.status(500).json({ error: 'Failed to get media metadata' });
  }
});

// Stream media file
app.get('/api/stream/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const range = req.headers.range;
    
    const mediaPath = await mediaScanner.getMediaPath(id);
    if (!mediaPath) {
      return res.status(404).json({ error: 'Media not found' });
    }

    await mediaStreamer.stream(req, res, mediaPath, range);
  } catch (error) {
    console.error('Error streaming media:', error);
    res.status(500).json({ error: 'Failed to stream media' });
  }
});

// Get media thumbnail
app.get('/api/thumbnail/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const thumbnailPath = await mediaScanner.getThumbnail(id);
    
    if (thumbnailPath && await fs.pathExists(thumbnailPath)) {
      return res.sendFile(path.resolve(thumbnailPath));
    }
    
    res.status(404).json({ error: 'Thumbnail not found' });
  } catch (error) {
    console.error('Error getting thumbnail:', error);
    res.status(500).json({ error: 'Failed to get thumbnail' });
  }
});

// Search movies/shows from API
app.get('/api/search', async (req, res) => {
  try {
    const { q, page = 1, movies = '1', tv = '1', anime = '1', limit } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const allResults = [];
    const searchPromises = [];
    
    // Search movies if enabled
    if (movies === '1') {
      searchPromises.push(
        movieAPI.searchMovies(q, parseInt(page)).catch(() => [])
      );
    }
    
    // Search TV shows if enabled
    if (tv === '1') {
      searchPromises.push(
        movieAPI.searchTVShows(q, parseInt(page)).catch(() => [])
      );
    }
    
    // Search anime if enabled
    if (anime === '1') {
      searchPromises.push(
        movieAPI.searchAnime(q, parseInt(page)).catch(() => [])
      );
    }
    
    const results = await Promise.all(searchPromises);
    results.forEach(result => {
      if (Array.isArray(result)) {
        allResults.push(...result);
      }
    });
    
    // Deduplicate results
    const deduplicated = movieAPI.deduplicateMedia(allResults);
    
    // Apply limit if specified (for quick search suggestions)
    const finalResults = limit ? deduplicated.slice(0, parseInt(limit)) : deduplicated;
    
    res.json(finalResults);
  } catch (error) {
    console.error('Error searching API:', error);
    res.status(500).json({ error: 'Failed to search' });
  }
});

// Get featured content from API
app.get('/api/featured', async (req, res) => {
  try {
    const featured = await movieAPI.getFeatured();
    res.json(featured);
  } catch (error) {
    console.error('Error getting featured:', error);
    res.status(500).json({ error: 'Failed to get featured content' });
  }
});

// Get popular movies
app.get('/api/popular/movies', async (req, res) => {
  try {
    const { page = 1 } = req.query;
    const movies = await movieAPI.getPopularMovies(parseInt(page));
    console.log(`[TMDB] Loaded ${movies.length} popular movies from page ${page}`);
    res.json(movies);
  } catch (error) {
    console.error('Error getting popular movies:', error);
    res.status(500).json({ error: 'Failed to get popular movies' });
  }
});

// Get bulk movies (multiple endpoints for maximum titles)
app.get('/api/bulk/movies', async (req, res) => {
  try {
    const { pages = 20, start = 1 } = req.query;
    const allMovies = [];
    const startPage = parseInt(start);
    const pageCount = Math.min(parseInt(pages), 20); // Max 20 pages per endpoint
    const endPage = startPage + pageCount - 1;
    
    console.log(`[TMDB] Loading movies from multiple endpoints (${pageCount} pages each)...`);
    
    // Load from multiple endpoints simultaneously for maximum coverage
    const endpoints = [
      { name: 'popular', method: (p) => movieAPI.getPopularMovies(p) },
      { name: 'trending', method: (p) => movieAPI.getTrendingMovies(p) },
      { name: 'top_rated', method: (p) => movieAPI.getTopRatedMovies(p) },
      { name: 'now_playing', method: (p) => movieAPI.getNowPlayingMovies(p) },
      { name: 'upcoming', method: (p) => movieAPI.getUpcomingMovies(p) }
    ];
    
    // Load pages in parallel batches for speed (2 at a time to avoid rate limits)
    const batchSize = 2;
    
    for (const endpoint of endpoints) {
      try {
        const endpointMovies = [];
        for (let batchStart = startPage; batchStart <= endPage; batchStart += batchSize) {
          const batchEnd = Math.min(batchStart + batchSize - 1, endPage);
          const batchPromises = [];
          
          for (let i = batchStart; i <= batchEnd; i++) {
            batchPromises.push(
              endpoint.method(i).catch(error => {
                console.warn(`[TMDB] Error loading ${endpoint.name} page ${i}:`, error.message);
                return []; // Return empty array on error
              })
            );
          }
          
          const batchResults = await Promise.all(batchPromises);
          batchResults.forEach(movies => endpointMovies.push(...movies));
          
          // Small delay between batches to respect rate limits
          if (batchEnd < endPage) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        allMovies.push(...endpointMovies);
        console.log(`[TMDB] Loaded ${endpointMovies.length} movies from ${endpoint.name} (pages ${startPage}-${endPage})`);
      } catch (error) {
        console.warn(`[TMDB] Error loading ${endpoint.name} movies:`, error.message);
      }
    }
    
    // Deduplicate movies
    const seen = new Map();
    const uniqueMovies = [];
    for (const movie of allMovies) {
      const key = `${movie.tmdbId || movie.id}`;
      if (!seen.has(key)) {
        seen.set(key, true);
        uniqueMovies.push(movie);
      }
    }
    
    console.log(`[TMDB] Bulk load complete: ${uniqueMovies.length} unique movies from ${allMovies.length} total`);
    res.json(uniqueMovies);
  } catch (error) {
    console.error('Error getting bulk movies:', error);
    res.status(500).json({ error: 'Failed to get bulk movies' });
  }
});

// Get popular TV shows
app.get('/api/popular/tv', async (req, res) => {
  try {
    const { page = 1 } = req.query;
    const tvShows = await movieAPI.getPopularTVShows(parseInt(page));
    console.log(`[TMDB] Loaded ${tvShows.length} popular TV shows from page ${page}`);
    res.json(tvShows);
  } catch (error) {
    console.error('Error getting popular TV shows:', error);
    res.status(500).json({ error: 'Failed to get popular TV shows' });
  }
});

// Get bulk TV shows (multiple endpoints + TVMaze for maximum titles)
app.get('/api/bulk/tv', async (req, res) => {
  try {
    const { pages = 20, start = 1 } = req.query;
    const allShows = [];
    const startPage = parseInt(start);
    const pageCount = Math.min(parseInt(pages), 20); // Max 20 pages per endpoint
    const endPage = startPage + pageCount - 1;
    
    console.log(`[TV] Loading TV shows from multiple APIs (${pageCount} pages each)...`);
    
    // Load from multiple endpoints simultaneously for maximum coverage
    const endpoints = [
      { name: 'tmdb_popular', method: (p) => movieAPI.getPopularTVShows(p) },
      { name: 'tmdb_top_rated', method: (p) => movieAPI.getTopRatedTVShows(p) },
      { name: 'tvmaze', method: (p) => movieAPI.getPopularTVShowsFromTVMaze(p) }
    ];
    
    // Load pages in parallel batches for speed (2 at a time to avoid rate limits)
    const batchSize = 2;
    
    for (const endpoint of endpoints) {
      try {
        const endpointShows = [];
        for (let batchStart = startPage; batchStart <= endPage; batchStart += batchSize) {
          const batchEnd = Math.min(batchStart + batchSize - 1, endPage);
          const batchPromises = [];
          
          for (let i = batchStart; i <= batchEnd; i++) {
            batchPromises.push(
              endpoint.method(i).catch(error => {
                console.warn(`[${endpoint.name}] Error loading TV page ${i}:`, error.message);
                return []; // Return empty array on error
              })
            );
          }
          
          const batchResults = await Promise.all(batchPromises);
          batchResults.forEach(shows => endpointShows.push(...shows));
          
          // Small delay between batches to respect rate limits
          if (batchEnd < endPage) {
            await new Promise(resolve => setTimeout(resolve, 150));
          }
        }
        
        allShows.push(...endpointShows);
        console.log(`[${endpoint.name}] Loaded ${endpointShows.length} TV shows (pages ${startPage}-${endPage})`);
      } catch (error) {
        console.warn(`[${endpoint.name}] Error loading TV shows:`, error.message);
      }
    }
    
    // Deduplicate TV shows by title and year (not just ID since different APIs)
    const uniqueShows = movieAPI.deduplicateMedia(allShows);
    
    console.log(`[TV] Bulk load complete: ${uniqueShows.length} unique TV shows from ${allShows.length} total`);
    res.json(uniqueShows);
  } catch (error) {
    console.error('Error getting bulk TV shows:', error);
    res.status(500).json({ error: 'Failed to get bulk TV shows' });
  }
});

app.get('/api/popular/anime', async (req, res) => {
  try {
    const { page = 1 } = req.query;
    const anime = await movieAPI.getPopularAnime(parseInt(page));
    res.json(anime);
  } catch (error) {
    console.error('Error getting popular anime:', error);
    res.status(500).json({ error: 'Failed to get popular anime' });
  }
});

// Get bulk anime (Jikan + AniList for maximum titles)
app.get('/api/bulk/anime', async (req, res) => {
  try {
    const { pages = 20, start = 1 } = req.query;
    let allAnime = [];
    const startPage = parseInt(start);
    const pageCount = Math.min(parseInt(pages), 20); // Max 20 pages per API
    const endPage = startPage + pageCount - 1;
    
    console.log(`[Anime] Loading from Jikan + AniList APIs (${pageCount} pages each)...`);
    
    // Load from both Jikan and AniList simultaneously
    const apis = [
      { name: 'jikan', method: (p) => movieAPI.getPopularAnimeFromJikan(p) },
      { name: 'anilist', method: (p) => movieAPI.getPopularAnimeFromAniList(p) }
    ];
    
    // Load pages in smaller batches (2 at a time) to respect rate limits
    const batchSize = 2;
    
    for (const api of apis) {
      try {
        const apiAnime = [];
        for (let batchStart = startPage; batchStart <= endPage; batchStart += batchSize) {
          const batchEnd = Math.min(batchStart + batchSize - 1, endPage);
          const batchPromises = [];
          
          for (let i = batchStart; i <= batchEnd; i++) {
            batchPromises.push(
              api.method(i).catch(error => {
                console.warn(`[${api.name}] Error loading page ${i}:`, error.message);
                return []; // Return empty array on error
              })
            );
          }
          
          const batchResults = await Promise.all(batchPromises);
          batchResults.forEach(anime => apiAnime.push(...anime));
          
          // Small delay between batches to respect rate limits
          if (batchEnd < endPage) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
        
        allAnime.push(...apiAnime);
        console.log(`[${api.name}] Loaded ${apiAnime.length} anime (pages ${startPage}-${endPage})`);
      } catch (error) {
        console.warn(`[${api.name}] Error loading anime:`, error.message);
      }
    }
    
    // Deduplicate anime by title and year (since different APIs use different IDs)
    const uniqueAnime = movieAPI.deduplicateMedia(allAnime);
    
    console.log(`[Anime] Bulk load complete: ${uniqueAnime.length} unique anime from ${allAnime.length} total`);
    res.json(uniqueAnime);
  } catch (error) {
    console.error('Error getting bulk anime:', error);
    res.status(500).json({ error: 'Failed to get bulk anime' });
  }
});

// Get cartoons
app.get('/api/cartoons', async (req, res) => {
  try {
    const { page = 1 } = req.query;
    const cartoons = await movieAPI.getCartoons(parseInt(page));
    res.json(cartoons);
  } catch (error) {
    console.error('Error getting cartoons:', error);
    res.status(500).json({ error: 'Failed to get cartoons' });
  }
});

// Check if streaming is available for a media item
app.get('/api/streaming/check/:mediaId', async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { type } = req.query;
    
    // Extract ID from mediaId format
    let id = null;
    let actualType = type;
    
    if (mediaId.startsWith('tmdb_movie_')) {
      id = mediaId.replace('tmdb_movie_', '');
      actualType = 'movie';
    } else if (mediaId.startsWith('tmdb_tv_')) {
      id = mediaId.replace('tmdb_tv_', '');
      actualType = 'tv';
    } else if (mediaId.startsWith('anime_')) {
      actualType = 'anime';
      // For anime, we'd need Anilist ID - skip check for now
      return res.json({ available: false, reason: 'Anime availability check requires Anilist ID' });
    }
    
    if (!id) {
      return res.json({ available: false, reason: 'Invalid media ID' });
    }
    
    // Check if Cinetaro has this content
    const available = await movieAPI.checkCinetaroAvailability(id, actualType);
    res.json({ available, mediaId, type: actualType });
  } catch (error) {
    console.error('Error checking streaming availability:', error);
    res.json({ available: false, reason: 'Check failed' });
  }
});

// Get TV show details (seasons and episodes)
app.get('/api/tv/:tvId/details', async (req, res) => {
  try {
    const { tvId } = req.params;
    const id = tvId.replace('tmdb_tv_', '');
    
    if (!process.env.TMDB_API_KEY) {
      return res.status(400).json({ error: 'TMDB API key not configured' });
    }
    
    try {
      const response = await axios.get(`https://api.themoviedb.org/3/tv/${id}`, {
        params: {
          api_key: process.env.TMDB_API_KEY,
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
        seasons: seasons,
        totalEpisodes: tvShow.number_of_episodes,
        totalSeasons: tvShow.number_of_seasons
      });
    } catch (error) {
      console.error('Error fetching TV show details:', error.message);
      res.status(500).json({ error: 'Failed to fetch TV show details' });
    }
  } catch (error) {
    console.error('Error in TV details endpoint:', error);
    res.status(500).json({ error: 'Failed to get TV show details' });
  }
});

// Get episodes for a specific season
app.get('/api/tv/:tvId/season/:seasonNumber', async (req, res) => {
  try {
    const { tvId, seasonNumber } = req.params;
    const id = tvId.replace('tmdb_tv_', '');
    
    if (!process.env.TMDB_API_KEY) {
      return res.status(400).json({ error: 'TMDB API key not configured' });
    }
    
    try {
      const response = await axios.get(`https://api.themoviedb.org/3/tv/${id}/season/${seasonNumber}`, {
        params: {
          api_key: process.env.TMDB_API_KEY,
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
    } catch (error) {
      console.error('Error fetching season details:', error.message);
      res.status(500).json({ error: 'Failed to fetch season details' });
    }
  } catch (error) {
    console.error('Error in season endpoint:', error);
    res.status(500).json({ error: 'Failed to get season details' });
  }
});

// Get streaming URL from Cinetaro (for movies, TV shows, anime)
app.get('/api/streaming/:mediaId', async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { type, season = 1, episode = 1, language = 'english', animeType = 'sub', subtitleLang } = req.query;
    
    // Extract ID from mediaId format (e.g., "tmdb_movie_550" -> 550)
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
      // Try to get Anilist ID from query param first
      anilistId = req.query.anilistId;
      
      // If not in query, try to get it from popular anime results
      if (!anilistId) {
        try {
          const popularAnime = await movieAPI.getPopularAnime(1);
          const anime = popularAnime.find(a => a.id === mediaId);
          if (anime && anime.anilistId) {
            anilistId = anime.anilistId;
          }
        } catch (error) {
          console.warn('Could not fetch anime data for Anilist ID:', error.message);
        }
      }
      
      if (!anilistId) {
        // If still no Anilist ID, use MAL ID as fallback (though Cinetaro prefers Anilist)
        id = mediaId.replace('anime_', '');
        // For now, return error but with helpful message
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
    
    // Use subtitle language if provided, otherwise use the main language
    const streamLanguage = subtitleLang || language;
    
    const streamingUrl = movieAPI.getStreamingUrl(id, actualType, {
      season: parseInt(season),
      episode: parseInt(episode),
      language: streamLanguage,
      animeType: animeType || 'sub'
    });
    
    if (!streamingUrl) {
      return res.status(404).json({ error: 'Streaming not available. Make sure USE_CINETARO=true in your .env file.' });
    }
    
    res.json({ streamingUrl, type: 'cinetaro', language: streamLanguage });
  } catch (error) {
    console.error('Error getting streaming URL:', error);
    res.status(500).json({ error: 'Failed to get streaming URL' });
  }
});

// Get all media (local + API)
app.get('/api/media/all', async (req, res) => {
  try {
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

    // Deduplicate media (remove duplicates by title and year)
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
  } catch (error) {
    console.error('Error getting all media:', error);
    res.status(500).json({ error: 'Failed to get media' });
  }
});

// Get all available genres from media library
app.get('/api/genres', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error getting genres:', error);
    res.status(500).json({ error: 'Failed to get genres' });
  }
});

// Proxy for external images (to avoid CORS issues)
app.get('/api/image/:type/:source/:id', async (req, res) => {
  try {
    const { type, source, id } = req.params;
    let imageUrl = null;

    if (source === 'tmdb') {
      imageUrl = `https://image.tmdb.org/t/p/w500${id}`;
    } else if (source === 'jikan') {
      imageUrl = id; // Jikan returns full URLs
    }

    if (!imageUrl) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Redirect to the image URL
    res.redirect(imageUrl);
  } catch (error) {
    console.error('Error proxying image:', error);
    res.status(500).json({ error: 'Failed to get image' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    mediaPath: MEDIA_PATH,
    tmdbConfigured: !!process.env.TMDB_API_KEY && process.env.TMDB_API_KEY !== 'your_tmdb_api_key_here',
    apis: {
      tmdb: !!process.env.TMDB_API_KEY && process.env.TMDB_API_KEY !== 'your_tmdb_api_key_here',
      jikan: true, // Always available (no key needed)
      cinetaro: process.env.USE_CINETARO !== 'false'
    },
    message: process.env.TMDB_API_KEY && process.env.TMDB_API_KEY !== 'your_tmdb_api_key_here' 
      ? 'TMDB API key configured - movies and TV shows are loading from your API'
      : 'TMDB API key not configured - add TMDB_API_KEY to your .env file to see movies and TV shows'
  });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server - listen on all network interfaces (0.0.0.0) to allow network access
const os = require('os');

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  const ipAddresses = [];
  
  // Get all non-internal IPv4 addresses
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // Prefer private network ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
        const ip = iface.address;
        if (ip.startsWith('192.168.') || 
            ip.startsWith('10.') || 
            (ip.startsWith('172.') && parseInt(ip.split('.')[1]) >= 16 && parseInt(ip.split('.')[1]) <= 31)) {
          ipAddresses.push({ address: ip, name: name, interface: iface });
        }
      }
    }
  }
  
  // Prefer 192.168.x.x (most common home network), then 10.x.x.x
  const wifiIP = ipAddresses.find(ip => ip.address.startsWith('192.168.'));
  if (wifiIP) return wifiIP.address;
  
  const lanIP = ipAddresses.find(ip => ip.address.startsWith('10.'));
  if (lanIP) return lanIP.address;
  
  // Return first available IP
  if (ipAddresses.length > 0) return ipAddresses[0].address;
  
  return 'localhost';
}

const LOCAL_IP = getLocalIP();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Deme Movies Streaming Server running!`);
  console.log(`📁 Media directory: ${MEDIA_PATH}`);
  console.log(`\n📍 Access from this computer:`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`\n🌐 Access from other devices on your network:`);
  
  // Show all network IPs for easier connection
  const allIPs = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const ip = iface.address;
        // Only show private network IPs (not APIPA 169.254.x.x)
        if (!ip.startsWith('169.254.')) {
          allIPs.push({ ip, name });
        }
      }
    }
  }
  
  // Show WiFi IP first if available
  const wifiIP = allIPs.find(i => i.ip.startsWith('192.168.') || i.name.toLowerCase().includes('wi-fi') || i.name.toLowerCase().includes('wireless'));
  if (wifiIP) {
    console.log(`   WiFi: http://${wifiIP.ip}:${PORT} (RECOMMENDED)`);
  }
  
  // Show other IPs
  allIPs.forEach(({ ip, name }) => {
    if (!wifiIP || ip !== wifiIP.ip) {
      console.log(`   ${name}: http://${ip}:${PORT}`);
    }
  });
  
  if (allIPs.length === 0) {
    console.log(`   http://${LOCAL_IP}:${PORT}`);
  }
  
  console.log(`\n💡 Make sure all devices are on the SAME WiFi/network!`);
  console.log(`   Try the WiFi IP address first.`);
  console.log(`   Open your browser to http://localhost:${PORT} to start streaming!\n`);
});

