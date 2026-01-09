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
    // Fallback streaming sources - multiple APIs for redundancy
    this.fallbackSources = [
      {
        name: 'cinetaro',
        baseUrl: 'https://apicinetaro.falex43350.workers.dev',
        priority: 1,
        enabled: true
      },
      {
        name: 'cinetaro-alt',
        baseUrl: 'https://cinetaro-api.vercel.app',
        priority: 2,
        enabled: true
      },
      {
        name: 'vidsrc',
        baseUrl: 'https://vidsrc.me',
        priority: 3,
        enabled: true
      },
      {
        name: 'embed',
        baseUrl: 'https://embed.su',
        priority: 4,
        enabled: true
      }
    ];
    
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
        streamingUrl: this.useCinetaro ? this.getStreamingUrlSync(item.id, 'movie') : null,
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
        streamingUrl: this.useCinetaro ? this.getStreamingUrlSync(item.id, 'tv', { season: 1, episode: 1 }) : null,
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
          streamingUrl: (this.useCinetaro && anilistId) ? this.getStreamingUrlSync(anilistId, 'anime', { season: 1, episode: 1 }) : (item.trailer?.url || null),
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
          streamingUrl: this.useCinetaro ? this.getStreamingUrlSync(item.id, 'movie') : null,
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
          streamingUrl: this.useCinetaro ? this.getStreamingUrlSync(item.id, 'movie') : null,
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
          streamingUrl: this.useCinetaro ? this.getStreamingUrlSync(item.id, 'movie') : null,
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
          streamingUrl: this.useCinetaro ? this.getStreamingUrlSync(item.id, 'movie') : null,
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
          streamingUrl: this.useCinetaro ? this.getStreamingUrlSync(item.id, 'movie') : null,
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
          streamingUrl: this.useCinetaro ? this.getStreamingUrlSync(item.id, 'tv', { season: 1, episode: 1 }) : null,
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
          streamingUrl: this.useCinetaro ? this.getStreamingUrlSync(item.id, 'tv', { season: 1, episode: 1 }) : null,
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
            streamingUrl: (this.useCinetaro && anilistId) ? this.getStreamingUrlSync(anilistId, 'anime', { season: 1, episode: 1 }) : (item.trailer?.url || null),
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
            streamingUrl: this.useCinetaro ? this.getStreamingUrlSync(item.id, 'anime', { season: 1, episode: 1 }) : null,
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
        streamingUrl: this.useCinetaro ? this.getStreamingUrlSync(item.id, 'movie') : null,
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
   * Get streaming URL from a specific source
   * 
   * @param {string|number} id - TMDB ID for movies/TV, Anilist ID for anime
   * @param {string} type - 'movie', 'tv', or 'anime'
   * @param {object} options - Additional options (season, episode, language, etc.)
   * @param {object} source - Source configuration object
   */
  getStreamingUrlFromSource(id, type = 'movie', options = {}, source) {
    if (!source || !source.enabled) return null;

    const { season = 1, episode = 1, language = 'english', animeType = 'sub' } = options;
    const baseUrl = source.baseUrl;

    try {
      let url = null;

      if (source.name === 'cinetaro' || source.name === 'cinetaro-alt') {
        // Cinetaro format
        if (type === 'movie') {
          url = `${baseUrl}/movie/${id}/${language}`;
        } else if (type === 'tv') {
          url = `${baseUrl}/tv/${id}/${season}/${episode}/${language}`;
        } else if (type === 'anime') {
          url = `${baseUrl}/anime/anilist/${animeType}/${id}/${season}/${episode}`;
        }
      } else if (source.name === 'vidsrc') {
        // Vidsrc format
        if (type === 'movie') {
          url = `${baseUrl}/embed/movie/${id}`;
        } else if (type === 'tv') {
          url = `${baseUrl}/embed/tv/${id}/${season}-${episode}`;
        }
      } else if (source.name === 'embed') {
        // Generic embed format
        if (type === 'movie') {
          url = `${baseUrl}/embed/movie/${id}`;
        } else if (type === 'tv') {
          url = `${baseUrl}/embed/tv/${id}/${season}/${episode}`;
        }
      }

      return url;
    } catch (error) {
      console.warn(`Error generating URL from ${source.name}:`, error.message);
      return null;
    }
  }

  /**
   * Get streaming/embed URL with fallback support
   * Tries multiple sources in priority order until one works
   * 
   * @param {string|number} id - TMDB ID for movies/TV, Anilist ID for anime
   * @param {string} type - 'movie', 'tv', or 'anime'
   * @param {object} options - Additional options (season, episode, language, etc.)
   * @param {boolean} checkAvailability - If true, checks if URL is actually available
   */
  async getStreamingUrl(id, type = 'movie', options = {}, checkAvailability = false) {
    if (!this.useCinetaro) return null;

    // Sort sources by priority
    const sortedSources = [...this.fallbackSources]
      .filter(s => s.enabled)
      .sort((a, b) => a.priority - b.priority);

    // If not checking availability, return primary source URL immediately (fast)
    if (!checkAvailability) {
      const primarySource = sortedSources[0];
      if (primarySource) {
        return this.getStreamingUrlFromSource(id, type, options, primarySource);
      }
      return null;
    }

    // Try each source in order with availability checking
    for (const source of sortedSources) {
      const url = this.getStreamingUrlFromSource(id, type, options, source);
      
      if (!url) continue;

      // Check if this URL is actually available
      try {
        const isAvailable = await this.checkStreamingUrlAvailability(url, source.name);
        if (isAvailable) {
          console.log(`[Streaming] Using ${source.name} for ${type} ${id}`);
          return url;
        }
      } catch (error) {
        // Try next source
        continue;
      }
    }

    // If checking availability and none worked, return primary source URL anyway
    // (let the frontend handle the error)
    const primarySource = sortedSources[0];
    if (primarySource) {
      return this.getStreamingUrlFromSource(id, type, options, primarySource);
    }

    return null;
  }

  /**
   * Get streaming URL synchronously (for bulk operations where async is not needed)
   * Returns URL from primary source without checking availability
   */
  getStreamingUrlSync(id, type = 'movie', options = {}) {
    if (!this.useCinetaro) return null;

    const sortedSources = [...this.fallbackSources]
      .filter(s => s.enabled)
      .sort((a, b) => a.priority - b.priority);

    const primarySource = sortedSources[0];
    if (primarySource) {
      return this.getStreamingUrlFromSource(id, type, options, primarySource);
    }

    return null;
  }

  /**
   * Check if a streaming URL is actually available
   * 
   * @param {string} url - The streaming URL to check
   * @param {string} sourceName - Name of the source (for logging)
   */
  async checkStreamingUrlAvailability(url, sourceName = 'unknown') {
    if (!url) return false;

    try {
      const response = await axios.head(url, {
        timeout: 3000, // Fast timeout for fallback checking
        validateStatus: (status) => status < 500, // Accept any status below 500
        maxRedirects: 2
      });
      
      // Some sources return 200 even if content doesn't exist
      // For now, accept 200-299 as available
      const isAvailable = response.status >= 200 && response.status < 300;
      
      if (!isAvailable) {
        console.log(`[Streaming] ${sourceName} returned status ${response.status} for ${url}`);
      }
      
      return isAvailable;
    } catch (error) {
      // Timeout or network error - assume not available
      return false;
    }
  }

  /**
   * Check if any streaming source has content available for a given ID
   * Tries all fallback sources
   */
  async checkCinetaroAvailability(id, type = 'movie', options = {}) {
    if (!this.useCinetaro) return false;

    // Try to get streaming URL with availability checking
    const url = await this.getStreamingUrl(id, type, options, true);
    return url !== null;
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
   * Get cartoons/animation content from multiple sources
   * Fetches from: TMDB Animation movies, TMDB Animation TV shows, AniList, and searches
   */
  async getCartoons(page = 1) {
    if (!this.tmdbApiKey) {
      console.warn('TMDB API key not set. Set TMDB_API_KEY environment variable for cartoon content.');
      // Fallback to anime-only if TMDB not available
      return this.getPopularAnimeFromJikan(page).catch(() => []);
    }

    const cacheKey = `cartoons_all_${page}`;
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    try {
      // Fetch from multiple sources in parallel
      const [
        animationMovies,
        animationTVShows,
        popularAnime,
        topRatedAnimationMovies,
        topRatedAnimationTV
      ] = await Promise.all([
        // TMDB Animation movies (genre ID 16)
        this.getMoviesByGenre(16, page).catch(() => []),
        // TMDB Animation TV shows (genre ID 16)
        this.getTVShowsByGenre(16, page).catch(() => []),
        // AniList anime (many cartoons are classified as anime)
        this.getPopularAnimeFromAniList(page).catch(() => []),
        // TMDB Top Rated Animation Movies
        this.getTopRatedAnimationMovies(page).catch(() => []),
        // TMDB Top Rated Animation TV Shows
        this.getTopRatedAnimationTV(page).catch(() => [])
      ]);

      // Combine all results
      let allCartoons = [
        ...animationMovies,
        ...animationTVShows,
        ...popularAnime,
        ...topRatedAnimationMovies,
        ...topRatedAnimationTV
      ];

      // Filter out duplicates and ensure valid items
      allCartoons = allCartoons.filter(item => 
        item && 
        item.title && 
        (item.posterUrl || item.backdropUrl)
      );

      // Deduplicate by title and year
      const deduplicated = this.deduplicateMedia(allCartoons);

      await this.setCache(cacheKey, deduplicated);
      return deduplicated;
    } catch (error) {
      console.error('Error getting cartoons:', error.message);
      return [];
    }
  }

  /**
   * Get top rated animation movies from TMDB
   */
  async getTopRatedAnimationMovies(page = 1) {
    if (!this.tmdbApiKey) return [];

    const cacheKey = `tmdb_top_rated_animation_movies_${page}`;
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${this.tmdbBaseUrl}/discover/movie`, {
        params: {
          api_key: this.tmdbApiKey,
          with_genres: 16, // Animation genre
          sort_by: 'vote_average.desc',
          'vote_count.gte': 100, // Minimum votes for quality
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
          streamingUrl: this.useCinetaro ? this.getStreamingUrlSync(item.id, 'movie') : null,
          hasStreaming: this.useCinetaro,
          subtitles: this.useCinetaro ? ['english', 'spanish', 'french', 'german'] : []
        }))
        .filter(item => item.title && item.posterUrl && item.tmdbId);

      await this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      console.error('Error getting top rated animation movies:', error.message);
      return [];
    }
  }

  /**
   * Get top rated animation TV shows from TMDB
   */
  async getTopRatedAnimationTV(page = 1) {
    if (!this.tmdbApiKey) return [];

    const cacheKey = `tmdb_top_rated_animation_tv_${page}`;
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${this.tmdbBaseUrl}/discover/tv`, {
        params: {
          api_key: this.tmdbApiKey,
          with_genres: 16, // Animation genre
          sort_by: 'vote_average.desc',
          'vote_count.gte': 50, // Minimum votes for quality
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
          streamingUrl: this.useCinetaro ? this.getStreamingUrlSync(item.id, 'tv', { season: 1, episode: 1 }) : null,
          hasStreaming: this.useCinetaro,
          subtitles: this.useCinetaro ? ['english', 'spanish', 'french', 'german'] : []
        }))
        .filter(item => item.title && item.posterUrl && item.tmdbId);

      await this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      console.error('Error getting top rated animation TV:', error.message);
      return [];
    }
  }

  /**
   * Get TV shows by genre (TMDB)
   */
  async getTVShowsByGenre(genreId, page = 1) {
    if (!this.tmdbApiKey) return [];

    const cacheKey = `tmdb_tv_genre_${genreId}_${page}`;
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${this.tmdbBaseUrl}/discover/tv`, {
        params: {
          api_key: this.tmdbApiKey,
          with_genres: genreId,
          page: page,
          language: 'en-US',
          sort_by: 'popularity.desc'
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
          streamingUrl: this.useCinetaro ? this.getStreamingUrlSync(item.id, 'tv', { season: 1, episode: 1 }) : null,
          hasStreaming: this.useCinetaro,
          subtitles: this.useCinetaro ? ['english', 'spanish', 'french', 'german'] : []
        }))
        .filter(item => item.title && item.posterUrl && item.tmdbId);

      await this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      console.error('Error getting TV shows by genre:', error.message);
      return [];
    }
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
   * Get movie/TV show from OMDb API by IMDb ID (requires free API key - 1,000 requests/day)
   * Returns enriched metadata including ratings, awards, box office, etc.
   */
  async getMovieFromOMDb(imdbId) {
    if (!this.omdbApiKey) {
      return null; // OMDb requires API key
    }

    const cacheKey = `omdb_${imdbId}`;
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
      
      // Parse ratings array
      const ratings = {};
      if (data.Ratings && Array.isArray(data.Ratings)) {
        data.Ratings.forEach(rating => {
          if (rating.Source && rating.Value) {
            const source = rating.Source.toLowerCase().replace(/\s+/g, '_');
            ratings[source] = rating.Value;
          }
        });
      }

      return {
        id: `omdb_${imdbId}`,
        title: data.Title,
        year: data.Year,
        rated: data.Rated !== 'N/A' ? data.Rated : null,
        released: data.Released !== 'N/A' ? data.Released : null,
        runtime: data.Runtime !== 'N/A' ? data.Runtime : null,
        overview: data.Plot !== 'N/A' ? data.Plot : null,
        genres: data.Genre !== 'N/A' ? data.Genre.split(', ').map(g => g.trim()) : [],
        director: data.Director !== 'N/A' ? data.Director : null,
        writer: data.Writer !== 'N/A' ? data.Writer : null,
        actors: data.Actors !== 'N/A' ? data.Actors : null,
        language: data.Language !== 'N/A' ? data.Language : null,
        country: data.Country !== 'N/A' ? data.Country : null,
        awards: data.Awards !== 'N/A' ? data.Awards : null,
        posterUrl: data.Poster !== 'N/A' ? data.Poster : null,
        ratings: ratings,
        metascore: data.Metascore !== 'N/A' ? parseFloat(data.Metascore) : null,
        imdbRating: data.imdbRating !== 'N/A' ? parseFloat(data.imdbRating) : null,
        imdbVotes: data.imdbVotes !== 'N/A' ? data.imdbVotes.replace(/,/g, '') : null,
        imdbID: data.imdbID,
        type: data.Type, // 'movie' or 'series'
        dvd: data.DVD !== 'N/A' ? data.DVD : null,
        boxOffice: data.BoxOffice !== 'N/A' ? data.BoxOffice : null,
        production: data.Production !== 'N/A' ? data.Production : null,
        website: data.Website !== 'N/A' ? data.Website : null,
        // Use IMDb rating as primary rating if available
        rating: data.imdbRating !== 'N/A' ? parseFloat(data.imdbRating) : null
      };
    } catch (error) {
      console.error('Error getting movie from OMDb:', error.message);
      return null;
    }
  }

  /**
   * Search OMDb by title (requires free API key)
   * Returns first match with full metadata
   */
  async searchOMDbByTitle(title, year = null) {
    if (!this.omdbApiKey) {
      return null;
    }

    const cacheKey = `omdb_search_${title}_${year || 'any'}`;
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const params = {
        apikey: this.omdbApiKey,
        t: title,
        plot: 'full'
      };
      
      if (year) {
        params.y = year;
      }

      const response = await axios.get(this.omdbBaseUrl, {
        params: params,
        timeout: 10000
      });

      if (response.data.Response === 'False') {
        return null;
      }

      // Get full details using the IMDb ID
      if (response.data.imdbID) {
        return await this.getMovieFromOMDb(response.data.imdbID);
      }

      return null;
    } catch (error) {
      console.error('Error searching OMDb:', error.message);
      return null;
    }
  }

  /**
   * Enrich TMDB movie/TV data with OMDb metadata
   * Tries to match by title and year, then enriches with OMDb data
   */
  async enrichWithOMDb(tmdbItem) {
    if (!this.omdbApiKey || !tmdbItem) {
      return tmdbItem; // Return as-is if no OMDb key or no item
    }

    try {
      // Try to get IMDb ID from TMDB details if available
      // For now, search OMDb by title and year
      const omdbData = await this.searchOMDbByTitle(tmdbItem.title, tmdbItem.year);
      
      if (!omdbData) {
        return tmdbItem; // No OMDb match, return original
      }

      // Merge OMDb data into TMDB item (don't overwrite existing good data)
      return {
        ...tmdbItem,
        // Enhance with OMDb metadata
        imdbId: omdbData.imdbID || tmdbItem.imdbId,
        imdbRating: omdbData.imdbRating || tmdbItem.rating,
        metascore: omdbData.metascore || tmdbItem.metascore,
        omdbRatings: omdbData.ratings || {},
        director: omdbData.director || tmdbItem.director,
        writer: omdbData.writer || tmdbItem.writer,
        actors: omdbData.actors || tmdbItem.actors,
        awards: omdbData.awards || tmdbItem.awards,
        boxOffice: omdbData.boxOffice || tmdbItem.boxOffice,
        rated: omdbData.rated || tmdbItem.rated,
        runtime: omdbData.runtime || tmdbItem.runtime,
        country: omdbData.country || tmdbItem.country,
        language: omdbData.language || tmdbItem.language,
        // Use better poster if OMDb has one and TMDB doesn't
        posterUrl: tmdbItem.posterUrl || omdbData.posterUrl,
        // Enhance plot/overview if OMDb has more detailed one
        overview: (omdbData.overview && omdbData.overview.length > (tmdbItem.overview?.length || 0)) 
          ? omdbData.overview 
          : (tmdbItem.overview || omdbData.overview),
        // Merge genres
        genres: [...new Set([...(tmdbItem.genres || []), ...(omdbData.genres || [])])],
        // Flag that this was enriched with OMDb
        enrichedWithOMDb: true
      };
    } catch (error) {
      console.warn('Error enriching with OMDb:', error.message);
      return tmdbItem; // Return original on error
    }
  }

}

module.exports = MovieAPI;

