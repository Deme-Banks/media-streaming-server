/**
 * Application State Management
 * Centralized state for the entire application
 */

export const state = {
    // Media state
    allMedia: [],
    filteredMedia: [],
    allAPIContent: [],
    currentPage: 1,
    itemsPerPage: 24,
    currentFilter: 'all',
    currentGenre: 'all',
    availableGenres: [],
    showSource: 'all', // 'all', 'local', 'api'
    
    // User state
    currentUser: null,
    userFavorites: [],
    showingFavorites: false,
    showingCollections: false,
    collections: [],
    
    // Streaming state
    streamingVerified: new Set(), // Track which items we've verified
    nonStreamableItems: new Set(), // Track items that don't stream
    
    // TV Show state
    currentSeason: 1,
    currentEpisode: 1,
    tvShowDetails: null,
    tvShowSeasons: [],
    tvShowEpisodes: [],
    
    // Search state
    searchSuggestionsTimeout: null,
    searchHistory: [],
    currentSearchTerm: '',
    searchFilters: {
        movies: true,
        tv: true,
        anime: true
    },
    
    // API Settings
    defaultAPISettings: {
        // Movies
        'api_tmdb_popular': true,
        'api_tmdb_trending': true,
        'api_tmdb_toprated': true,
        'api_tmdb_nowplaying': true,
        'api_tmdb_upcoming': true,
        // TV Shows
        'api_tmdb_tv_popular': true,
        'api_tmdb_tv_toprated': true,
        'api_tvmaze': true,
        // Anime
        'api_jikan': true,
        'api_anilist': true
    },
    apiSettings: {}
};

// Initialize apiSettings with defaults
state.apiSettings = { ...state.defaultAPISettings };
