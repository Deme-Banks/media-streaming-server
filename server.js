require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const session = require('express-session');

const MediaScanner = require('./src/services/mediaScanner');
const MediaStreamer = require('./src/services/mediaStreamer');
const MovieAPI = require('./src/services/movieAPI');
const UserService = require('./src/services/userService');
const FavoritesService = require('./src/services/favoritesService');

const app = express();
const PORT = process.env.PORT || 3000;
const MEDIA_PATH = process.env.MEDIA_PATH || path.join(__dirname, 'media');

// Middleware
app.use(cors({
  origin: true,
  credentials: true
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
    const { q, page = 1 } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const results = await movieAPI.universalSearch(q, parseInt(page));
    res.json(results);
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
      animeType
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

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Deme Movies Streaming Server running on http://localhost:${PORT}`);
  console.log(`📁 Media directory: ${MEDIA_PATH}`);
  console.log(`\nOpen your browser to http://localhost:${PORT} to start streaming!\n`);
});

