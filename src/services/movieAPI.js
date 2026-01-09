const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

/**
 * Movie API Service
 * Integrates multiple free APIs for movies, TV shows, cartoons, and anime
 * 
 * APIs used:
 * - TMDB (The Movie Database) - requires free API key
 * - Jikan API - free anime API (no key needed)
 * - Cinetaro API - free streaming links
 */

class MovieAPI {
  constructor() {
    // Load API keys from environment or config
    this.tmdbApiKey = process.env.TMDB_API_KEY || '';
    // Enable Cinetaro by default (can be disabled by setting USE_CINETARO=false)
    this.useCinetaro = process.env.USE_CINETARO !== 'false';
    
    // Base URLs
    this.tmdbBaseUrl = 'https://api.themoviedb.org/3';
    this.tmdbImageUrl = 'https://image.tmdb.org/t/p/w500';
    this.jikanBaseUrl = 'https://api.jikan.moe/v4';
    this.anilistGraphQlUrl = 'https://graphql.anilist.co';
    this.tvmazeBaseUrl = 'https://api.tvmaze.com';
    this.omdbBaseUrl = 'http://www.omdbapi.com';
    this.omdbApiKey = process.env.OMDB_API_KEY || ''; // Optional - free tier: 1,000 requests/day
    this.cinetaroBaseUrl = 'https://apicinetaro.falex43350.workers.dev';
    // Fallback streaming sources (can be added later)
    this.fallbackSources = [];
    
    // Cache for API responses
    this.cacheDir = path.join(__dirname, '../../.cache/api');
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
    fs.ensureDirSync(this.cacheDir);
    
    // Genre mapping (will be populated from TMDB API)
    this.genreMap = {
      movie: {},
      tv: {}
    };
    // Initialize genres asynchronously (don't await - let it load in background)
    this.initGenres().catch(err => console.warn('Genre initialization error:', err.message));
  }

  /**
   * Initialize genre mappings from TMDB
   */
  async initGenres() {
    if (!this.tmdbApiKey) return;
    
    try {
      // Get movie genres
      const movieGenresResponse = await axios.get(`${this.tmdbBaseUrl}/genre/movie/list`, {
        params: { api_key: this.tmdbApiKey, language: 'en-US' },
        timeout: 10000
      });
      movieGenresResponse.data.genres.forEach(genre => {
        this.genreMap.movie[genre.id] = genre.name;
      });

      // Get TV genres
      const tvGenresResponse = await axios.get(`${this.tmdbBaseUrl}/genre/tv/list`, {
        params: { api_key: this.tmdbApiKey, language: 'en-US' },
        timeout: 10000
      });
      tvGenresResponse.data.genres.forEach(genre => {
        this.genreMap.tv[genre.id] = genre.name;
      });
    } catch (error) {
      console.warn('Error initializing genres:', error.message);
    }
  }

  /**
   * Map genre IDs to genre names
   */
  mapGenres(genreIds, type = 'movie') {
    if (!genreIds || !Array.isArray(genreIds)) return [];
    return genreIds.map(id => this.genreMap[type][id] || `Genre ${id}`).filter(Boolean);
  }

  /**
   * Normalize title for deduplication (remove special chars, lowercase, etc.)
   */
  normalizeTitle(title) {
    if (!title || typeof title !== 'string') return '';
    return title.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Create a unique key for deduplication
   */
  getDedupKey(media) {
    const normalizedTitle = this.normalizeTitle(media.title || media.originalTitle);
    const year = media.year || (media.releaseDate ? media.releaseDate.split('-')[0] : '');
    return `${normalizedTitle}_${year}`;
  }

  /**
   * Deduplicate media items by title and year
   * Keeps the item with better metadata (prefers API content over local)
   */
  deduplicateMedia(mediaArray) {
    if (!Array.isArray(mediaArray) || mediaArray.length === 0) {
      return [];
    }

    const seen = new Map();
    
    for (const item of mediaArray) {
      // Skip invalid items
      if (!item || (!item.title && !item.originalTitle)) {
        continue;
      }

      try {
        const key = this.getDedupKey(item);
        if (!key || key === '_') {
          // Skip items with invalid keys (no title or year)
          continue;
        }

        const existing = seen.get(key);
        
        if (!existing) {
          seen.set(key, item);
        } else {
          // Prefer API content (has posters, metadata) over local files
          // Prefer items with streaming over those without
          const preferNew = 
            (item.source && !existing.source) ||
            (item.hasStreaming && !existing.hasStreaming) ||
            (item.posterUrl && !existing.posterUrl) ||
            (item.genres && Array.isArray(item.genres) && item.genres.length > 0 && (!existing.genres || !Array.isArray(existing.genres) || existing.genres.length === 0));
          
          if (preferNew) {
            seen.set(key, item);
          }
        }
      } catch (error) {
        console.warn('Error processing media item during deduplication:', error);
        continue;
      }
    }
    
    return Array.from(seen.values());
  }

  /**
   * Get cache file path
   */
  getCachePath(key) {
    return path.join(this.cacheDir, `${key}.json`);
  }

  /**
   * Get cached data if valid
   */
  async getCached(key) {
    try {
      const cachePath = this.getCachePath(key);
      if (await fs.pathExists(cachePath)) {
        const data = await fs.readJson(cachePath);
        const now = Date.now();
        if (data.timestamp && (now - data.timestamp) < this.cacheExpiry) {
          return data.data;
        }
      }
    } catch (error) {
      console.warn('Cache read error:', error.message);
    }
    return null;
  }

  /**
   * Cache data
   */
  async setCache(key, data) {
    try {
      const cachePath = this.getCachePath(key);
      await fs.writeJson(cachePath, {
        timestamp: Date.now(),
        data: data
      });
    } catch (error) {
      console.warn('Cache write error:', error.message);
    }
  }

  /**
   * Search movies using TMDB
   */
  async searchMovies(query, page = 1) {
    if (!this.tmdbApiKey) {
      console.warn('TMDB API key not set. Set TMDB_API_KEY environment variable for movie search.');
      return [];
    }

    const cacheKey = `movie_search_${query}_${page}`;
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${this.tmdbBaseUrl}/search/movie`, {
        params: {
          api_key: this.tmdbApiKey,
          query: query,
          page: page,
          language: 'en-US'
        },
        timeout: 10000
      });

      const results = response.data.results.map(item => ({
        id: `tmdb_movie_${item.id}`,
        title: item.title,
        originalTitle: item.original_title,
        overview: item.overview,
        releaseDate: item.release_date,
        year: item.release_date ? item.release_date.split('-')[0] : null,
        posterUrl: item.poster_path ? `${this.tmdbImageUrl}${item.poster_path}` : null,
        backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
        rating: item.vote_average,
        popularity: item.popularity,
        type: 'movie',
        source: 'tmdb',
        tmdbId: item.id,
        genres: this.mapGenres(item.genre_ids || [], 'movie'),
        genreIds: item.genre_ids || [],
        hasThumbnail: !!item.poster_path,
        // Cinetaro streaming URL (if enabled)
        streamingUrl: this.useCinetaro ? this.getStreamingUrl(item.id, 'movie') : null,
        hasStreaming: this.useCinetaro,
        // Subtitle support (Cinetaro supports multiple languages)
        subtitles: this.useCinetaro ? ['english', 'spanish', 'french', 'german'] : []
      }));

      await this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      console.error('Error searching movies:', error.message);
      return [];
    }
  }

  /**
   * Search TV shows using TMDB
   */
  async searchTVShows(query, page = 1) {
    if (!this.tmdbApiKey) {
      console.warn('TMDB API key not set. Set TMDB_API_KEY environment variable for TV show search.');
      return [];
    }

    const cacheKey = `tv_search_${query}_${page}`;
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${this.tmdbBaseUrl}/search/tv`, {
        params: {
          api_key: this.tmdbApiKey,
          query: query,
          page: page,
          language: 'en-US'
        },
        timeout: 10000
      });

      const results = response.data.results.map(item => ({
        id: `tmdb_tv_${item.id}`,
        title: item.name,
        originalTitle: item.original_name,
        overview: item.overview,
        releaseDate: item.first_air_date,
        year: item.first_air_date ? item.first_air_date.split('-')[0] : null,
        posterUrl: item.poster_path ? `${this.tmdbImageUrl}${item.poster_path}` : null,
        backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
        rating: item.vote_average,
        popularity: item.popularity,
        type: 'tv',
        source: 'tmdb',
        tmdbId: item.id,
        genres: this.mapGenres(item.genre_ids || [], 'tv'),
        genreIds: item.genre_ids || [],
        hasThumbnail: !!item.poster_path,
        // Cinetaro streaming URL (if enabled) - default to season 1, episode 1
        streamingUrl: this.useCinetaro ? this.getStreamingUrl(item.id, 'tv', { season: 1, episode: 1 }) : null,
        hasStreaming: this.useCinetaro,
        // Subtitle support
        subtitles: this.useCinetaro ? ['english', 'spanish', 'french', 'german'] : []
      }));

      await this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      console.error('Error searching TV shows:', error.message);
      return [];
    }
  }

  /**
   * Search anime using Jikan API (free, no key needed)
   */
  async searchAnime(query, page = 1) {
    const cacheKey = `anime_search_${query}_${page}`;
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${this.jikanBaseUrl}/anime`, {
        params: {
          q: query,
          page: page,
          limit: 20
        },
        timeout: 10000
      });

      const results = response.data.data.map(item => {
        // Try to get Anilist ID from external links if available
        // Note: Jikan uses MyAnimeList IDs, but Cinetaro uses Anilist IDs
        const anilistId = item.external?.find(ext => ext.name === 'AniList')?.url?.match(/\/(\d+)/)?.[1];
        
        return {
          id: `anime_${item.mal_id}`,
          title: item.title,
          originalTitle: item.title_english || item.title_japanese || item.title,
          overview: item.synopsis || '',
          releaseDate: item.aired?.from || null,
          year: item.aired?.from ? item.aired.from.split('T')[0].split('-')[0] : null,
          posterUrl: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || null,
          backdropUrl: item.images?.jpg?.large_image_url || null,
          rating: item.score,
          popularity: item.popularity,
          type: 'anime',
          source: 'jikan',
          malId: item.mal_id,
          anilistId: anilistId,
          genres: item.genres?.map(g => g.name) || [],
          episodes: item.episodes,
          status: item.status,
          hasThumbnail: !!item.images?.jpg?.image_url,
          // Cinetaro streaming URL if Anilist ID is available and Cinetaro is enabled
          streamingUrl: (this.useCinetaro && anilistId) ? this.getStreamingUrl(anilistId, 'anime', { season: 1, episode: 1 }) : (item.trailer?.url || null),
          hasStreaming: this.useCinetaro && !!anilistId,
          // Subtitle support for anime (sub/dub options)
          subtitles: (this.useCinetaro && anilistId) ? ['sub', 'dub', 'hindi'] : []
        };
      });

      await this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      console.error('Error searching anime:', error.message);
      return [];
    }
  }

  /**
   * Get trending movies (what's hot right now)
   */
  async getTrendingMovies(page = 1) {
    if (!this.tmdbApiKey) {
      console.warn('[TMDB] API key not set. Movies will not be loaded. Add TMDB_API_KEY to your .env file.');
      return [];
    }

    const cacheKey = `trending_movies_${page}`;
    const cached = await this.getCached(cacheKey);
    if (cached) {
      console.log(`[TMDB] Using cached trending movies (page ${page})`);
      return cached;
    }

    try {
      console.log(`[TMDB] Fetching trending movies from TMDB API (page ${page})...`);
      const response = await axios.get(`${this.tmdbBaseUrl}/trending/movie/day`, {
        params: {
          api_key: this.tmdbApiKey,
          page: page,
          language: 'en-US'
        },
        timeout: 10000
      });

      const results = response.data.results
        .map(item => ({
          id: `tmdb_movie_${item.id}`,
          title: item.title,
          originalTitle: item.original_title,
          overview: item.overview,
          releaseDate: item.release_date,
          year: item.release_date ? item.release_date.split('-')[0] : null,
          posterUrl: item.poster_path ? `${this.tmdbImageUrl}${item.poster_path}` : null,
          backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
          rating: item.vote_average,
          popularity: item.popularity,
          type: 'movie',
          source: 'tmdb',
          tmdbId: item.id,
          genres: this.mapGenres(item.genre_ids || [], 'movie'),
          genreIds: item.genre_ids || [],
          hasThumbnail: !!item.poster_path,
          streamingUrl: this.useCinetaro ? this.getStreamingUrl(item.id, 'movie') : null,
          hasStreaming: this.useCinetaro,
          subtitles: this.useCinetaro ? ['english', 'spanish', 'french', 'german'] : []
        }))
        .filter(item => item.title && item.posterUrl && item.tmdbId);

      await this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      console.error('Error getting trending movies:', error.message);
      return [];
    }
  }

  /**
   * Get now playing movies (new releases)
   */
  async getNowPlayingMovies(page = 1) {
    if (!this.tmdbApiKey) {
      console.warn('[TMDB] API key not set. Movies will not be loaded. Add TMDB_API_KEY to your .env file.');
      return [];
    }

    const cacheKey = `now_playing_movies_${page}`;
    const cached = await this.getCached(cacheKey);
    if (cached) {
      console.log(`[TMDB] Using cached now playing movies (page ${page})`);
      return cached;
    }

    try {
      console.log(`[TMDB] Fetching now playing movies from TMDB API (page ${page})...`);
      const response = await axios.get(`${this.tmdbBaseUrl}/movie/now_playing`, {
        params: {
          api_key: this.tmdbApiKey,
          page: page,
          language: 'en-US'
        },
        timeout: 10000
      });

      const results = response.data.results
        .map(item => ({
          id: `tmdb_movie_${item.id}`,
          title: item.title,
          originalTitle: item.original_title,
          overview: item.overview,
          releaseDate: item.release_date,
          year: item.release_date ? item.release_date.split('-')[0] : null,
          posterUrl: item.poster_path ? `${this.tmdbImageUrl}${item.poster_path}` : null,
          backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
          rating: item.vote_average,
          popularity: item.popularity,
          type: 'movie',
          source: 'tmdb',
          tmdbId: item.id,
          genres: this.mapGenres(item.genre_ids || [], 'movie'),
          genreIds: item.genre_ids || [],
          hasThumbnail: !!item.poster_path,
          streamingUrl: this.useCinetaro ? this.getStreamingUrl(item.id, 'movie') : null,
          hasStreaming: this.useCinetaro,
          subtitles: this.useCinetaro ? ['english', 'spanish', 'french', 'german'] : []
        }))
        .filter(item => item.title && item.posterUrl && item.tmdbId);

      await this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      console.error('Error getting now playing movies:', error.message);
      return [];
    }
  }

  /**
   * Get popular movies
   */
  /**
   * Get top rated movies from TMDB
   */
  async getTopRatedMovies(page = 1) {
    if (!this.tmdbApiKey) {
      console.warn('TMDB API key not set');
      return [];
    }

    const cacheKey = `top_rated_movies_${page}`;
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${this.tmdbBaseUrl}/movie/top_rated`, {
        params: {
          api_key: this.tmdbApiKey,
          page: page,
          language: 'en-US'
        },
        timeout: 10000
      });

      const results = response.data.results
        .filter(item => item.title && item.poster_path)
        .map(item => ({
          id: `tmdb_movie_${item.id}`,
          title: item.title,
          originalTitle: item.original_title,
          overview: item.overview,
          releaseDate: item.release_date,
          year: item.release_date ? item.release_date.split('-')[0] : null,
          posterUrl: item.poster_path ? `${this.tmdbImageUrl}${item.poster_path}` : null,
          backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
          rating: item.vote_average,
          popularity: item.popularity,
          type: 'movie',
          source: 'tmdb',
          tmdbId: item.id,
          genres: this.mapGenres(item.genre_ids || [], 'movie'),
          genreIds: item.genre_ids || [],
          hasThumbnail: !!item.poster_path,
          streamingUrl: this.useCinetaro ? this.getStreamingUrl(item.id, 'movie') : null,
          hasStreaming: this.useCinetaro,
          subtitles: this.useCinetaro ? ['english', 'spanish', 'french', 'german'] : []
        }));

      await this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      console.error('Error getting top rated movies:', error.message);
      return [];
    }
  }

  /**
   * Get upcoming movies from TMDB
   */
  async getUpcomingMovies(page = 1) {
    if (!this.tmdbApiKey) {
      console.warn('TMDB API key not set');
      return [];
    }

    const cacheKey = `upcoming_movies_${page}`;
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${this.tmdbBaseUrl}/movie/upcoming`, {
        params: {
          api_key: this.tmdbApiKey,
          page: page,
          language: 'en-US'
        },
        timeout: 10000
      });

      const results = response.data.results
        .filter(item => item.title && item.poster_path)
        .map(item => ({
          id: `tmdb_movie_${item.id}`,
          title: item.title,
          originalTitle: item.original_title,
          overview: item.overview,
          releaseDate: item.release_date,
          year: item.release_date ? item.release_date.split('-')[0] : null,
          posterUrl: item.poster_path ? `${this.tmdbImageUrl}${item.poster_path}` : null,
          backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
          rating: item.vote_average,
          popularity: item.popularity,
          type: 'movie',
          source: 'tmdb',
          tmdbId: item.id,
          genres: this.mapGenres(item.genre_ids || [], 'movie'),
          genreIds: item.genre_ids || [],
          hasThumbnail: !!item.poster_path,
          streamingUrl: this.useCinetaro ? this.getStreamingUrl(item.id, 'movie') : null,
          hasStreaming: this.useCinetaro,
          subtitles: this.useCinetaro ? ['english', 'spanish', 'french', 'german'] : []
        }));

      await this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      console.error('Error getting upcoming movies:', error.message);
      return [];
    }
  }

  async getPopularMovies(page = 1) {
    if (!this.tmdbApiKey) {
      console.warn('[TMDB] API key not set. Movies will not be loaded. Add TMDB_API_KEY to your .env file.');
      return [];
    }

    const cacheKey = `popular_movies_${page}`;
    const cached = await this.getCached(cacheKey);
    if (cached) {
      console.log(`[TMDB] Using cached popular movies (page ${page})`);
      return cached;
    }

    try {
      console.log(`[TMDB] Fetching popular movies from TMDB API (page ${page})...`);
      const response = await axios.get(`${this.tmdbBaseUrl}/movie/popular`, {
        params: {
          api_key: this.tmdbApiKey,
          page: page,
          language: 'en-US'
        },
        timeout: 10000
      });

      const results = response.data.results
        .map(item => ({
          id: `tmdb_movie_${item.id}`,
          title: item.title,
          originalTitle: item.original_title,
          overview: item.overview,
          releaseDate: item.release_date,
          year: item.release_date ? item.release_date.split('-')[0] : null,
          posterUrl: item.poster_path ? `${this.tmdbImageUrl}${item.poster_path}` : null,
          backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
          rating: item.vote_average,
          popularity: item.popularity,
          type: 'movie',
          source: 'tmdb',
          tmdbId: item.id,
          genres: this.mapGenres(item.genre_ids || [], 'movie'),
          genreIds: item.genre_ids || [],
          hasThumbnail: !!item.poster_path,
          // Cinetaro streaming URL (if enabled)
          streamingUrl: this.useCinetaro ? this.getStreamingUrl(item.id, 'movie') : null,
          hasStreaming: this.useCinetaro,
          subtitles: this.useCinetaro ? ['english', 'spanish', 'french', 'german'] : []
        }))
        // Filter out invalid items - must have title and poster for good UX
        .filter(item => item.title && item.posterUrl && item.tmdbId);

      await this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      console.error('Error getting popular movies:', error.message);
      return [];
    }
  }

  /**
   * Get top rated TV shows from TMDB
   */
  async getTopRatedTVShows(page = 1) {
    if (!this.tmdbApiKey) {
      console.warn('[TMDB] API key not set. TV shows will not be loaded.');
      return [];
    }

    const cacheKey = `top_rated_tv_${page}`;
    const cached = await this.getCached(cacheKey);
    if (cached) {
      console.log(`[TMDB] Using cached top rated TV shows (page ${page})`);
      return cached;
    }

    try {
      console.log(`[TMDB] Fetching top rated TV shows from TMDB API (page ${page})...`);
      const response = await axios.get(`${this.tmdbBaseUrl}/tv/top_rated`, {
        params: {
          api_key: this.tmdbApiKey,
          page: page,
          language: 'en-US'
        },
        timeout: 10000
      });

      const results = response.data.results
        .map(item => ({
          id: `tmdb_tv_${item.id}`,
          title: item.name,
          originalTitle: item.original_name,
          overview: item.overview,
          releaseDate: item.first_air_date,
          year: item.first_air_date ? item.first_air_date.split('-')[0] : null,
          posterUrl: item.poster_path ? `${this.tmdbImageUrl}${item.poster_path}` : null,
          backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
          rating: item.vote_average,
          popularity: item.popularity,
          type: 'tv',
          source: 'tmdb',
          tmdbId: item.id,
          genres: this.mapGenres(item.genre_ids || [], 'tv'),
          genreIds: item.genre_ids || [],
          hasThumbnail: !!item.poster_path,
          episodes: null,
          streamingUrl: this.useCinetaro ? this.getStreamingUrl(item.id, 'tv', { season: 1, episode: 1 }) : null,
          hasStreaming: this.useCinetaro,
          subtitles: this.useCinetaro ? ['english', 'spanish', 'french', 'german'] : []
        }))
        .filter(item => item.title && item.posterUrl && item.tmdbId);

      await this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      console.error('Error getting top rated TV shows:', error.message);
      return [];
    }
  }

  /**
   * Get popular anime
   */
  /**
   * Get popular TV shows using TMDB
   */
  async getPopularTVShows(page = 1) {
    if (!this.tmdbApiKey) {
      console.warn('[TMDB] API key not set. TV shows will not be loaded. Add TMDB_API_KEY to your .env file.');
      return [];
    }

    const cacheKey = `popular_tv_${page}`;
    const cached = await this.getCached(cacheKey);
    if (cached) {
      console.log(`[TMDB] Using cached popular TV shows (page ${page})`);
      return cached;
    }

    try {
      console.log(`[TMDB] Fetching popular TV shows from TMDB API (page ${page})...`);
      const response = await axios.get(`${this.tmdbBaseUrl}/tv/popular`, {
        params: {
          api_key: this.tmdbApiKey,
          page: page,
          language: 'en-US'
        },
        timeout: 10000
      });

      const results = response.data.results
        .map(item => ({
          id: `tmdb_tv_${item.id}`,
          title: item.name,
          originalTitle: item.original_name,
          overview: item.overview,
          releaseDate: item.first_air_date,
          year: item.first_air_date ? item.first_air_date.split('-')[0] : null,
          posterUrl: item.poster_path ? `${this.tmdbImageUrl}${item.poster_path}` : null,
          backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
          rating: item.vote_average,
          popularity: item.popularity,
          type: 'tv',
          source: 'tmdb',
          tmdbId: item.id,
          genres: this.mapGenres(item.genre_ids || [], 'tv'),
          genreIds: item.genre_ids || [],
          hasThumbnail: !!item.poster_path,
          episodes: null,
          // Cinetaro streaming URL (if enabled) - default to season 1, episode 1
          streamingUrl: this.useCinetaro ? this.getStreamingUrl(item.id, 'tv', { season: 1, episode: 1 }) : null,
          hasStreaming: this.useCinetaro,
          subtitles: this.useCinetaro ? ['english', 'spanish', 'french', 'german'] : []
        }))
        .filter(item => item.title && item.posterUrl && item.tmdbId);

      await this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      console.error('Error getting popular TV shows:', error.message);
      return [];
    }
  }

  /**
   * Get popular anime - combines Jikan and AniList results
   */
  async getPopularAnime(page = 1) {
    // Combine results from both Jikan and AniList
    const [jikanAnime, anilistAnime] = await Promise.all([
      this.getPopularAnimeFromJikan(page).catch(() => []),
      this.getPopularAnimeFromAniList(page).catch(() => [])
    ]);

    // Deduplicate by title and year
    const combined = [...jikanAnime, ...anilistAnime];
    return this.deduplicateMedia(combined);
  }

  /**
   * Get popular anime from Jikan API (original implementation)
   */
  async getPopularAnimeFromJikan(page = 1) {
    const cacheKey = `jikan_popular_anime_${page}`;
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${this.jikanBaseUrl}/top/anime`, {
        params: {
          page: page,
          limit: 20
        },
        timeout: 10000
      });

      const results = response.data.data
        .map(item => {
          // Try to get Anilist ID from external links if available
          const anilistId = item.external?.find(ext => ext.name === 'AniList')?.url?.match(/\/(\d+)/)?.[1];
          
          return {
            id: `jikan_anime_${item.mal_id}`,
            title: item.title,
            originalTitle: item.title_english || item.title_japanese || item.title,
            overview: item.synopsis || '',
            releaseDate: item.aired?.from || null,
            year: item.aired?.from ? item.aired.from.split('T')[0].split('-')[0] : null,
            posterUrl: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || null,
            backdropUrl: item.images?.jpg?.large_image_url || null,
            rating: item.score,
            popularity: item.popularity,
            type: 'anime',
            source: 'jikan',
            malId: item.mal_id,
            anilistId: anilistId,
            genres: item.genres?.map(g => g.name) || [],
            episodes: item.episodes,
            status: item.status,
            hasThumbnail: !!item.images?.jpg?.image_url,
            // Cinetaro streaming URL if Anilist ID is available and Cinetaro is enabled
            streamingUrl: (this.useCinetaro && anilistId) ? this.getStreamingUrl(anilistId, 'anime', { season: 1, episode: 1 }) : (item.trailer?.url || null),
            hasStreaming: this.useCinetaro && !!anilistId,
            // Subtitle support for anime
            subtitles: (this.useCinetaro && anilistId) ? ['sub', 'dub', 'hindi'] : []
          };
        })
        .filter(item => item.title && item.posterUrl && item.malId);

      await this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      console.error('Error getting popular anime from Jikan:', error.message);
      return [];
    }
  }

  /**
   * Get popular anime from AniList GraphQL API (free, comprehensive)
   */
  async getPopularAnimeFromAniList(page = 1) {
    const cacheKey = `anilist_popular_anime_${page}`;
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const perPage = 20;
      const query = `
        query ($page: Int, $perPage: Int) {
          Page(page: $page, perPage: $perPage) {
            pageInfo {
              total
              currentPage
              lastPage
              hasNextPage
            }
            media(type: ANIME, sort: POPULARITY_DESC) {
              id
              title {
                romaji
                english
                native
              }
              description
              startDate {
                year
                month
                day
              }
              coverImage {
                large
                extraLarge
              }
              bannerImage
              averageScore
              popularity
              genres
              episodes
              status
              format
              studios {
                nodes {
                  name
                }
              }
            }
          }
        }
      `;

      const response = await axios.post(
        this.anilistGraphQlUrl,
        {
          query: query,
          variables: {
            page: page,
            perPage: perPage
          }
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 10000
        }
      );

      const results = (response.data.data?.Page?.media || [])
        .map(item => {
          const title = item.title.english || item.title.romaji || item.title.native;
          const year = item.startDate?.year || null;
          
          return {
            id: `anilist_anime_${item.id}`,
            title: title,
            originalTitle: item.title.native || item.title.romaji,
            overview: item.description ? item.description.replace(/<[^>]*>/g, '').substring(0, 500) : '',
            releaseDate: item.startDate ? `${item.startDate.year}-${String(item.startDate.month || 1).padStart(2, '0')}-${String(item.startDate.day || 1).padStart(2, '0')}` : null,
            year: year,
            posterUrl: item.coverImage?.extraLarge || item.coverImage?.large || null,
            backdropUrl: item.bannerImage || null,
            rating: item.averageScore ? item.averageScore / 10 : null, // AniList uses 0-100, convert to 0-10
            popularity: item.popularity,
            type: 'anime',
            source: 'anilist',
            anilistId: item.id,
            genres: item.genres || [],
            episodes: item.episodes,
            status: item.status,
            format: item.format,
            studio: item.studios?.nodes?.[0]?.name || null,
            hasThumbnail: !!item.coverImage,
            streamingUrl: this.useCinetaro ? this.getStreamingUrl(item.id, 'anime', { season: 1, episode: 1 }) : null,
            hasStreaming: this.useCinetaro,
            subtitles: this.useCinetaro ? ['sub', 'dub'] : []
          };
        })
        .filter(item => item.title && item.posterUrl);

      await this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      console.error('Error getting popular anime from AniList:', error.message);
      return [];
    }
  }

  /**
   * Get movies by genre (including Animation/Cartoons)
   */
  async getMoviesByGenre(genreId, page = 1) {
    if (!this.tmdbApiKey) return [];

    const cacheKey = `movies_genre_${genreId}_${page}`;
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${this.tmdbBaseUrl}/discover/movie`, {
        params: {
          api_key: this.tmdbApiKey,
          with_genres: genreId,
          page: page,
          language: 'en-US',
          sort_by: 'popularity.desc'
        },
        timeout: 10000
      });

      const results = response.data.results.map(item => ({
        id: `tmdb_movie_${item.id}`,
        title: item.title,
        originalTitle: item.original_title,
        overview: item.overview,
        releaseDate: item.release_date,
        year: item.release_date ? item.release_date.split('-')[0] : null,
        posterUrl: item.poster_path ? `${this.tmdbImageUrl}${item.poster_path}` : null,
        backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
        rating: item.vote_average,
        popularity: item.popularity,
        type: 'movie',
        source: 'tmdb',
        tmdbId: item.id,
        genres: this.mapGenres(item.genre_ids || [], 'movie'),
        genreIds: item.genre_ids || [],
        hasThumbnail: !!item.poster_path,
        // Cinetaro streaming URL (if enabled)
        streamingUrl: this.useCinetaro ? this.getStreamingUrl(item.id, 'movie') : null,
        hasStreaming: this.useCinetaro,
        subtitles: this.useCinetaro ? ['english', 'spanish', 'french', 'german'] : []
      }));

      await this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      console.error('Error getting movies by genre:', error.message);
      return [];
    }
  }

  /**
   * Get streaming/embed URL from Cinetaro (if enabled)
   * Cinetaro provides embeddable iframe URLs
   * 
   * @param {string|number} id - TMDB ID for movies/TV, Anilist ID for anime
   * @param {string} type - 'movie', 'tv', or 'anime'
   * @param {object} options - Additional options (season, episode, language, etc.)
   */
  getStreamingUrl(id, type = 'movie', options = {}) {
    if (!this.useCinetaro) return null;

    const { season = 1, episode = 1, language = 'english', animeType = 'sub' } = options;

    try {
      let url = null;

      if (type === 'movie') {
        // Format: /movie/[TMDB_ID]/[LANG]
        url = `${this.cinetaroBaseUrl}/movie/${id}/${language}`;
      } else if (type === 'tv') {
        // Format: /tv/[TMDB_ID]/[S]/[E]/[LANG]
        url = `${this.cinetaroBaseUrl}/tv/${id}/${season}/${episode}/${language}`;
      } else if (type === 'anime') {
        // Format: /anime/anilist/[TYPE]/[ANILIST_ID]/[S]/[E]
        // Types: sub, dub, hindi
        url = `${this.cinetaroBaseUrl}/anime/anilist/${animeType}/${id}/${season}/${episode}`;
      }

      return url;
    } catch (error) {
      console.warn('Error generating Cinetaro URL:', error.message);
      return null;
    }
  }

  /**
   * Check if Cinetaro has content available for a given ID
   */
  async checkCinetaroAvailability(id, type = 'movie', options = {}) {
    if (!this.useCinetaro) return false;

    const url = this.getStreamingUrl(id, type, options);
    if (!url) return false;

    try {
      // Try to fetch the URL to see if it's available
      const response = await axios.head(url, {
        timeout: 5000,
        validateStatus: (status) => status < 500 // Accept any status below 500
      });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Universal search - searches all sources
   */
  async universalSearch(query, page = 1) {
    const results = [];

    // Search movies, TV shows, and anime in parallel
    const [movies, tvShows, anime] = await Promise.all([
      this.searchMovies(query, page),
      this.searchTVShows(query, page),
      this.searchAnime(query, page)
    ]);

    results.push(...movies, ...tvShows, ...anime);

    // Deduplicate results
    const deduplicated = this.deduplicateMedia(results);

    // Sort by relevance (popularity/rating)
    return deduplicated.sort((a, b) => {
      const scoreA = (b.popularity || 0) + (b.rating || 0) * 10;
      const scoreB = (a.popularity || 0) + (a.rating || 0) * 10;
      return scoreB - scoreA;
    });
  }

  /**
   * Get featured content (trending/new/hot movies, TV shows, and anime)
   */
  async getFeatured() {
    const results = [];

    // Get trending/new content - what's hot right now
    const [trendingMovies, nowPlayingMovies, jikanAnime, anilistAnime] = await Promise.all([
      this.getTrendingMovies(1).catch(() => []),
      this.getNowPlayingMovies(1).catch(() => []),
      this.getPopularAnimeFromJikan(1).catch(() => []),
      this.getPopularAnimeFromAniList(1).catch(() => [])
    ]);

    // Combine anime from both sources
    const popularAnime = [...jikanAnime, ...anilistAnime];
    
    // Prioritize trending and new releases
    // Mix trending (what's hot) and now playing (new releases)
    const hotMovies = [...trendingMovies, ...nowPlayingMovies];
    
    // Add trending/new movies (first 6)
    results.push(...hotMovies.slice(0, 6));

    // Add popular anime (first 2)
    results.push(...popularAnime.slice(0, 2));

    // Deduplicate
    const deduplicated = this.deduplicateMedia(results);

    // Sort by: newest releases first, then by popularity
    const sorted = deduplicated.sort((a, b) => {
      // First, prioritize by release date (newest first)
      const dateA = a.releaseDate || '1900-01-01';
      const dateB = b.releaseDate || '1900-01-01';
      const dateDiff = new Date(dateB) - new Date(dateA);
      
      if (Math.abs(dateDiff) > 30 * 24 * 60 * 60 * 1000) {
        // If release dates are more than 30 days apart, sort by date
        return dateDiff;
      }
      
      // Otherwise, sort by popularity + rating
      const scoreA = (a.popularity || 0) + (a.rating || 0) * 10;
      const scoreB = (b.popularity || 0) + (b.rating || 0) * 10;
      return scoreB - scoreA;
    });

    return sorted;
  }

  /**
   * Get cartoons/animation movies
   */
  async getCartoons(page = 1) {
    // TMDB genre ID for Animation is 16
    return this.getMoviesByGenre(16, page);
  }

  /**
   * Get TV shows from TVMaze API (free, no key needed)
   */
  async getPopularTVShowsFromTVMaze(page = 1) {
    const cacheKey = `tvmaze_tv_shows_${page}`;
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    try {
      // TVMaze uses page-based pagination (starts at 0)
      const response = await axios.get(`${this.tvmazeBaseUrl}/shows`, {
        params: {
          page: page - 1 // TVMaze uses 0-indexed pages
        },
        timeout: 10000
      });

      const results = (response.data || [])
        .map(item => {
          const premiered = item.premiered || null;
          const year = premiered ? premiered.split('-')[0] : null;
          
          return {
            id: `tvmaze_tv_${item.id}`,
            title: item.name,
            originalTitle: item.name,
            overview: item.summary ? item.summary.replace(/<[^>]*>/g, '').substring(0, 500) : '',
            releaseDate: premiered,
            year: year,
            posterUrl: item.image?.original || item.image?.medium || null,
            backdropUrl: item.image?.original || null,
            rating: item.rating?.average ? item.rating.average : null,
            popularity: item.weight || 0,
            type: 'tv',
            source: 'tvmaze',
            tvmazeId: item.id,
            genres: item.genres || [],
            episodes: null, // TVMaze doesn't provide total episodes in this endpoint
            status: item.status,
            network: item.network?.name || item.webChannel?.name || null,
            hasThumbnail: !!item.image,
            streamingUrl: null, // TVMaze doesn't provide streaming links directly
            hasStreaming: false,
            subtitles: []
          };
        })
        .filter(item => item.title && item.posterUrl);

      await this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      // TVMaze returns 404 when page is out of range - this is normal
      if (error.response?.status === 404) {
        return [];
      }
      console.error('Error getting TV shows from TVMaze:', error.message);
      return [];
    }
  }

  /**
   * Get movies from OMDb API (requires free API key - 1,000 requests/day)
   * Note: OMDb is better for metadata, not for listing. We'll use it as a supplement.
   */
  async getMovieFromOMDb(imdbId) {
    if (!this.omdbApiKey) {
      return null; // OMDb requires API key
    }

    const cacheKey = `omdb_movie_${imdbId}`;
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(this.omdbBaseUrl, {
        params: {
          apikey: this.omdbApiKey,
          i: imdbId,
          plot: 'full'
        },
        timeout: 10000
      });

      if (response.data.Response === 'False') {
        return null;
      }

      const data = response.data;
      return {
        id: `omdb_movie_${imdbId}`,
        title: data.Title,
        year: data.Year,
        overview: data.Plot,
        posterUrl: data.Poster !== 'N/A' ? data.Poster : null,
        rating: data.imdbRating !== 'N/A' ? parseFloat(data.imdbRating) : null,
        genres: data.Genre ? data.Genre.split(', ').map(g => g.trim()) : [],
        director: data.Director,
        actors: data.Actors,
        runtime: data.Runtime,
        imdbId: data.imdbID
      };
    } catch (error) {
      console.error('Error getting movie from OMDb:', error.message);
      return null;
    }
  }

}

module.exports = MovieAPI;

