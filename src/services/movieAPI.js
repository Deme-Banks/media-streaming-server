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
    this.cinetaroBaseUrl = 'https://apicinetaro.falex43350.workers.dev';
    
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
   * Get popular movies
   */
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
      console.error('Error getting popular movies:', error.message);
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
        episodes: null,
        // Cinetaro streaming URL (if enabled) - default to season 1, episode 1
        streamingUrl: this.useCinetaro ? this.getStreamingUrl(item.id, 'tv', { season: 1, episode: 1 }) : null,
        hasStreaming: this.useCinetaro,
        subtitles: this.useCinetaro ? ['english', 'spanish', 'french', 'german'] : []
      }));

      await this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      console.error('Error getting popular TV shows:', error.message);
      return [];
    }
  }

  async getPopularAnime(page = 1) {
    const cacheKey = `popular_anime_${page}`;
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

      const results = response.data.data.map(item => {
        // Try to get Anilist ID from external links if available
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
          // Subtitle support for anime
          subtitles: (this.useCinetaro && anilistId) ? ['sub', 'dub', 'hindi'] : []
        };
      });

      await this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      console.error('Error getting popular anime:', error.message);
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
   * Get featured content (mix of popular movies, TV shows, and anime)
   */
  async getFeatured() {
    const results = [];

    const [popularMovies, popularAnime] = await Promise.all([
      this.getPopularMovies(1),
      this.getPopularAnime(1)
    ]);

    // Add popular movies (first 4)
    results.push(...popularMovies.slice(0, 4));

    // Add popular anime (first 4)
    results.push(...popularAnime.slice(0, 4));

    // Deduplicate before shuffling
    const deduplicated = this.deduplicateMedia(results);

    // Shuffle for variety
    const shuffled = [...deduplicated];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Get cartoons/animation movies
   */
  async getCartoons(page = 1) {
    // TMDB genre ID for Animation is 16
    return this.getMoviesByGenre(16, page);
  }

}

module.exports = MovieAPI;

