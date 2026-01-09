// Global state
let allMedia = [];
let filteredMedia = [];
let allAPIContent = [];
let currentPage = 1;
const itemsPerPage = 24;
let currentFilter = 'all';
let currentGenre = 'all';
let availableGenres = [];
let showSource = 'all'; // 'all', 'local', 'api'
let currentUser = null;
let userFavorites = [];
let showingFavorites = false;
let showingCollections = false;
let collections = [];
let streamingVerified = new Set(); // Track which items we've verified
let nonStreamableItems = new Set(); // Track items that don't stream
let currentSeason = 1; // Current season for TV shows
let currentEpisode = 1; // Current episode for TV shows
let tvShowDetails = null; // TV show details (seasons/episodes)
let tvShowSeasons = []; // Available seasons
let tvShowEpisodes = []; // Episodes for current season

// API Settings - default all enabled
const defaultAPISettings = {
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
};

let apiSettings = { ...defaultAPISettings };

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    loadAPISettings(); // Load API settings first (before anything else)
    await checkAuth();
    await loadGenres(); // Load genres first
    await loadMedia();
    setupEventListeners();
    setupKeyboardShortcuts(); // Setup keyboard shortcuts
    if (currentUser) {
        await loadContinueWatching(); // Load continue watching if logged in
        await loadRecommendations(); // Load recommendations if logged in
    }
    
    // Continue watching will be loaded via updateUIAuthState when user logs in
    
    // Close dropdowns when clicking outside
    window.addEventListener('click', (event) => {
        const userMenu = document.getElementById('userMenu');
        const userDropdown = document.getElementById('userDropdown');
        if (userMenu && userDropdown && !userMenu.contains(event.target)) {
            userDropdown.style.display = 'none';
        }
        
        const videoModal = document.getElementById('videoModal');
        if (event.target === videoModal) {
            closeVideoModal();
        }
        
        const loginModal = document.getElementById('loginModal');
        if (event.target === loginModal) {
            closeLoginModal();
        }
        
        const registerModal = document.getElementById('registerModal');
        if (event.target === registerModal) {
            closeRegisterModal();
        }
        
        const settingsModal = document.getElementById('settingsModal');
        if (event.target === settingsModal) {
            closeSettings();
        }
    });
});

// Search state
let searchSuggestionsTimeout = null;
let searchHistory = [];
let currentSearchTerm = '';
let searchFilters = {
    movies: true,
    tv: true,
    anime: true
};

// Setup event listeners
function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch();
            hideSearchSuggestions();
        }
    });
    
    // Keyboard navigation in search suggestions
    searchInput.addEventListener('keydown', (e) => {
        const suggestions = document.getElementById('searchSuggestions');
        if (suggestions && suggestions.style.display !== 'none') {
            const items = suggestions.querySelectorAll('.search-suggestion-item');
            const currentActive = suggestions.querySelector('.search-suggestion-item.active');
            let currentIndex = currentActive ? Array.from(items).indexOf(currentActive) : -1;
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (currentActive) currentActive.classList.remove('active');
                currentIndex = (currentIndex + 1) % items.length;
                if (items[currentIndex]) {
                    items[currentIndex].classList.add('active');
                    items[currentIndex].scrollIntoView({ block: 'nearest' });
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (currentActive) currentActive.classList.remove('active');
                currentIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
                if (items[currentIndex]) {
                    items[currentIndex].classList.add('active');
                    items[currentIndex].scrollIntoView({ block: 'nearest' });
                }
            } else if (e.key === 'Enter' && currentActive) {
                e.preventDefault();
                currentActive.click();
            }
        }
    });
    
    // Load search history
    loadSearchHistory();
}

// Load API settings from localStorage
function loadAPISettings() {
    try {
        const saved = localStorage.getItem('apiSettings');
        if (saved) {
            apiSettings = { ...defaultAPISettings, ...JSON.parse(saved) };
        }
        // Update UI checkboxes
        Object.keys(apiSettings).forEach(key => {
            const checkbox = document.getElementById(key);
            if (checkbox) {
                checkbox.checked = apiSettings[key];
            }
        });
    } catch (error) {
        console.warn('Error loading API settings:', error);
        apiSettings = { ...defaultAPISettings };
    }
}

// Save API settings to localStorage
function saveAPISettings() {
    try {
        // Get current checkbox states
        Object.keys(apiSettings).forEach(key => {
            const checkbox = document.getElementById(key);
            if (checkbox) {
                apiSettings[key] = checkbox.checked;
            }
        });
        localStorage.setItem('apiSettings', JSON.stringify(apiSettings));
        console.log('API settings saved:', apiSettings);
    } catch (error) {
        console.error('Error saving API settings:', error);
    }
}

// Reset API settings to defaults
function resetAPISettings() {
    apiSettings = { ...defaultAPISettings };
    Object.keys(apiSettings).forEach(key => {
        const checkbox = document.getElementById(key);
        if (checkbox) {
            checkbox.checked = apiSettings[key];
        }
    });
    saveAPISettings();
}

// Show settings modal
function showSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        loadAPISettings(); // Load current settings
        modal.style.display = 'block';
        closeUserDropdown(); // Close user dropdown if open
    }
}

// Close settings modal
function closeSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.style.display = 'none';
        saveAPISettings(); // Save when closing
        // Reload media if settings changed
        loadMedia();
    }
}

// Filter API content based on enabled APIs
function filterAPIContent(content) {
    if (!Array.isArray(content)) return [];
    
    return content.filter(item => {
        if (!item.source) return true; // Keep items without source (local media)
        
        // Check movies
        if (item.type === 'movie' || item.id?.startsWith('tmdb_movie_')) {
            if (item.source === 'tmdb') {
                // For TMDB movies, we need to check which endpoint was used
                // Since we can't determine from the item, we'll check if any movie API is enabled
                return apiSettings['api_tmdb_popular'] || apiSettings['api_tmdb_trending'] || 
                       apiSettings['api_tmdb_toprated'] || apiSettings['api_tmdb_nowplaying'] || 
                       apiSettings['api_tmdb_upcoming'];
            }
        }
        
        // Check TV shows
        if (item.type === 'tv' || item.id?.startsWith('tmdb_tv_') || item.id?.startsWith('tvmaze_tv_')) {
            if (item.source === 'tmdb') {
                return apiSettings['api_tmdb_tv_popular'] || apiSettings['api_tmdb_tv_toprated'];
            }
            if (item.source === 'tvmaze') {
                return apiSettings['api_tvmaze'];
            }
        }
        
        // Check anime
        if (item.type === 'anime' || item.id?.startsWith('anime_') || item.id?.startsWith('jikan_') || item.id?.startsWith('anilist_')) {
            if (item.source === 'jikan') {
                return apiSettings['api_jikan'];
            }
            if (item.source === 'anilist') {
                return apiSettings['api_anilist'];
            }
        }
        
        return true; // Default: keep item if we can't determine
    });
}

// ========== Enhanced Search Functions ==========

// Handle search input (real-time suggestions)
let searchDebounceTimer = null;
async function handleSearchInput() {
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    const searchTerm = searchInput.value.trim();
    
    // Show/hide clear button
    if (clearBtn) {
        clearBtn.style.display = searchTerm ? 'block' : 'none';
    }
    
    // Show search filters when typing
    const searchFiltersEl = document.getElementById('searchFilters');
    if (searchFiltersEl) {
        searchFiltersEl.style.display = searchTerm ? 'flex' : 'none';
    }
    
    // Debounce search suggestions
    clearTimeout(searchDebounceTimer);
    if (searchTerm.length >= 2) {
        searchDebounceTimer = setTimeout(() => {
            showSearchSuggestions();
        }, 300); // Wait 300ms after user stops typing
    } else {
        hideSearchSuggestions();
    }
}

// Show search suggestions
async function showSearchSuggestions() {
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput.value.trim();
    
    if (searchTerm.length < 2) {
        hideSearchSuggestions();
        return;
    }
    
    const suggestionsDiv = document.getElementById('searchSuggestions');
    const suggestionsList = document.getElementById('searchSuggestionsList');
    
    if (!suggestionsDiv || !suggestionsList) return;
    
    try {
        // Show loading state
        suggestionsList.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">Searching...</div>';
        suggestionsDiv.style.display = 'block';
        
        // Fetch search results
        const results = await searchMedia(searchTerm, true); // Quick search, limit results
        
        if (results.length > 0) {
            // Show top 8 suggestions
            const topResults = results.slice(0, 8);
            suggestionsList.innerHTML = topResults.map(media => {
                const thumbnail = media.posterUrl || media.backdropUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzJhMmEyYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5Qb3N0ZXI8L3RleHQ+PC9zdmc+';
                const typeLabel = media.type === 'movie' ? 'Movie' : media.type === 'tv' ? 'TV' : media.type === 'anime' ? 'Anime' : 'Media';
                const year = media.year || (media.releaseDate ? media.releaseDate.split('-')[0] : '');
                const rating = media.rating ? `⭐ ${media.rating.toFixed(1)}` : '';
                
                return `
                    <div class="search-suggestion-item" onclick="selectSearchSuggestion('${media.id}', '${media.type || 'video'}', '${media.source || 'local'}')">
                        <img src="${thumbnail}" alt="${media.title}" class="search-suggestion-thumbnail" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzJhMmEyYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5Qb3N0ZXI8L3RleHQ+PC9zdmc+'">
                        <div class="search-suggestion-info">
                            <div class="search-suggestion-title">${media.title}</div>
                            <div class="search-suggestion-meta">
                                <span class="search-suggestion-type">${typeLabel}</span>
                                ${year ? `<span>${year}</span>` : ''}
                                ${rating ? `<span>${rating}</span>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            suggestionsList.innerHTML = '<div class="search-no-results">No results found</div>';
        }
    } catch (error) {
        console.warn('Error loading search suggestions:', error);
        suggestionsList.innerHTML = '<div class="search-no-results">Error loading suggestions</div>';
    }
}

// Hide search suggestions with delay (to allow clicks)
let hideSuggestionsTimeout = null;
function hideSearchSuggestionsDelayed() {
    hideSuggestionsTimeout = setTimeout(() => {
        hideSearchSuggestions();
    }, 200);
}

function hideSearchSuggestions() {
    const suggestionsDiv = document.getElementById('searchSuggestions');
    if (suggestionsDiv) {
        suggestionsDiv.style.display = 'none';
    }
    if (hideSuggestionsTimeout) {
        clearTimeout(hideSuggestionsTimeout);
    }
}

// Select search suggestion
function selectSearchSuggestion(mediaId, mediaType, source) {
    hideSearchSuggestions();
    openMediaPlayer(mediaId, mediaType, source);
}

// Clear search
function clearSearch() {
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    const searchFiltersEl = document.getElementById('searchFilters');
    const resultsCount = document.getElementById('resultsCount');
    const featuredSection = document.getElementById('featuredSection');
    
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }
    if (clearBtn) clearBtn.style.display = 'none';
    if (searchFiltersEl) searchFiltersEl.style.display = 'none';
    if (resultsCount) resultsCount.style.display = 'none';
    if (featuredSection) featuredSection.style.display = 'block';
    hideSearchSuggestions();
    
    // Reset to browse view
    showingFavorites = false;
    currentFilter = 'all';
    currentPage = 1;
    filteredMedia = [...allMedia, ...allAPIContent.filter(item => {
        if (nonStreamableItems.has(item.id)) return false;
        if (!item.source || item.source === 'local') return true;
        return item.hasStreaming === true || !!item.streamingUrl;
    })];
    displayMedia();
    displayFeatured();
}

// Update search filters
function updateSearchFilters() {
    searchFilters.movies = document.getElementById('filterMovies').checked;
    searchFilters.tv = document.getElementById('filterTV').checked;
    searchFilters.anime = document.getElementById('filterAnime').checked;
}

// Load search history
function loadSearchHistory() {
    try {
        const saved = localStorage.getItem('searchHistory');
        if (saved) {
            searchHistory = JSON.parse(saved);
        }
    } catch (error) {
        console.warn('Error loading search history:', error);
        searchHistory = [];
    }
}

// Save search to history
function saveSearchHistory(term) {
    if (!term || term.length < 2) return;
    
    // Remove if already exists
    searchHistory = searchHistory.filter(t => t.toLowerCase() !== term.toLowerCase());
    
    // Add to beginning
    searchHistory.unshift(term);
    
    // Keep only last 10
    searchHistory = searchHistory.slice(0, 10);
    
    try {
        localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
    } catch (error) {
        console.warn('Error saving search history:', error);
    }
}

// Search media (with filters)
async function searchMedia(query, quick = false) {
    if (!query || query.length < 2) return [];
    
    try {
        const searchParams = new URLSearchParams({
            q: query,
            movies: searchFilters.movies ? '1' : '0',
            tv: searchFilters.tv ? '1' : '0',
            anime: searchFilters.anime ? '1' : '0',
            limit: quick ? '8' : '50'
        });
        
        const response = await fetch(`/api/search?${searchParams}`);
        if (response.ok) {
            const results = await response.json();
            // Filter out non-streamable items
            return results.filter(item => {
                if (nonStreamableItems.has(item.id)) return false;
                if (!item.source || item.source === 'local') return true;
                return item.hasStreaming === true || !!item.streamingUrl;
            });
        }
    } catch (error) {
        console.error('Search error:', error);
    }
    
    return [];
}

// Close modal when clicking outside
window.onclick = function(event) {
    const settingsModal = document.getElementById('settingsModal');
    if (event.target === settingsModal) {
        closeSettings();
    }
    // Also handle other modals
    const loginModal = document.getElementById('loginModal');
    const registerModal = document.getElementById('registerModal');
    const videoModal = document.getElementById('videoModal');
    if (event.target === loginModal) {
        closeLoginModal();
    }
    if (event.target === registerModal) {
        closeRegisterModal();
    }
    if (event.target === videoModal) {
        closeVideoModal();
    }
}

// Load media from API - PROGRESSIVE LOADING for speed
async function loadMedia() {
    try {
        // Load API settings first
        loadAPISettings();
        
        // Get local media separately for streaming (fast)
        const localResponse = await fetch('/api/media');
        if (localResponse.ok) {
            allMedia = await localResponse.json();
        } else {
            allMedia = [];
        }

        // Show local media immediately
        const combinedMedia = [...allMedia];
        filteredMedia = combinedMedia;
        displayMedia();
        
        // Load API content progressively - FAST FIRST, then more in background
        allAPIContent = [];
        
        const fetchWithTimeout = (url, timeout = 10000) => {
            return Promise.race([
                fetch(url).then(r => {
                    if (!r.ok) {
                        console.warn(`API error for ${url}: ${r.status} ${r.statusText}`);
                        return [];
                    }
                    return r.json();
                }).catch(err => {
                    console.warn(`Fetch error for ${url}:`, err.message);
                    return [];
                }),
                new Promise(resolve => setTimeout(() => {
                    console.warn(`Timeout for ${url} after ${timeout}ms`);
                    resolve([]);
                }, timeout))
            ]);
        };
        
        console.log('🚀 Fast loading: Getting first batch of content...');
        console.log('📋 Active APIs:', Object.entries(apiSettings).filter(([k, v]) => v).map(([k]) => k));
        
               // STEP 1: Load first 5 pages from multiple endpoints FAST (shows content in ~5-8 seconds)
               // Build query params with enabled APIs
               const moviesEnabled = apiSettings['api_tmdb_popular'] || apiSettings['api_tmdb_trending'] ||
                                    apiSettings['api_tmdb_toprated'] || apiSettings['api_tmdb_nowplaying'] ||
                                    apiSettings['api_tmdb_upcoming'];
               const tvEnabled = apiSettings['api_tmdb_tv_popular'] || apiSettings['api_tmdb_tv_toprated'] || apiSettings['api_tvmaze'];
               const animeEnabled = apiSettings['api_jikan'] || apiSettings['api_anilist'];
               const cartoonsEnabled = true; // Cartoons are always enabled (uses multiple sources)
        
               let fastMovies = [], fastTV = [], fastAnime = [], fastCartoons = [];
        try {
            const fetchPromises = [];
            if (moviesEnabled) {
                fetchPromises.push(
                    fetchWithTimeout('/api/bulk/movies?pages=5', 15000).then(data => ({ type: 'movies', data }))
                );
            }
            if (tvEnabled) {
                fetchPromises.push(
                    fetchWithTimeout('/api/bulk/tv?pages=5', 15000).then(data => ({ type: 'tv', data }))
                );
            }
            if (animeEnabled) {
                fetchPromises.push(
                    fetchWithTimeout('/api/bulk/anime?pages=3', 10000).then(data => ({ type: 'anime', data }))
                );
            }
            if (cartoonsEnabled) {
                fetchPromises.push(
                    fetchWithTimeout('/api/bulk/cartoons?pages=5', 15000).then(data => ({ type: 'cartoons', data }))
                );
            }
            
                   const results = await Promise.all(fetchPromises);
                   results.forEach(result => {
                       if (result.type === 'movies') fastMovies = result.data || [];
                       if (result.type === 'tv') fastTV = result.data || [];
                       if (result.type === 'anime') fastAnime = result.data || [];
                       if (result.type === 'cartoons') fastCartoons = result.data || [];
                   });
        } catch (fetchError) {
            console.warn('Error fetching bulk content:', fetchError);
            // Continue with empty arrays - we'll still show local media
        }
        
               // Combine fast-loaded content
               let combinedAPI = [
                   ...(Array.isArray(fastMovies) ? fastMovies : []),
                   ...(Array.isArray(fastTV) ? fastTV : []),
                   ...(Array.isArray(fastAnime) ? fastAnime : []),
                   ...(Array.isArray(fastCartoons) ? fastCartoons : [])
               ];
        
        // Filter invalid items
        combinedAPI = combinedAPI.filter(item => 
            item && 
            item.id && 
            item.title && 
            (item.posterUrl || item.backdropUrl)
        );
        
        // Filter based on enabled APIs
        allAPIContent = filterAPIContent(combinedAPI);
        
        // Filter out items that don't have streaming available
        // Only show API content that has streaming URL or hasStreaming flag
        const streamableAPIContent = allAPIContent.filter(item => {
            // Remove items user confirmed don't work
            if (nonStreamableItems.has(item.id)) return false;
            
            // Keep local media (no source means local)
            if (!item.source || item.source === 'local') return true;
            
            // For API content, only keep if it has streaming
            return item.hasStreaming === true || !!item.streamingUrl;
        });
        
        // Display first batch immediately
        const combinedMediaFast = [...allMedia, ...streamableAPIContent];
        filteredMedia = combinedMediaFast;
        displayMedia();
        displayFeatured();
        
        console.log(`✅ Fast load complete: ${allAPIContent.length} items displayed`);
        console.log('📦 Loading more content in background...');
        
        // STEP 2: Load remaining pages in background (doesn't block UI)
               // Load more pages to get even more titles (only if APIs are enabled)
               const bgFetchPromises = [];
               if (moviesEnabled) {
                   bgFetchPromises.push(
                       fetchWithTimeout('/api/bulk/movies?pages=15&start=6', 90000).then(data => ({ type: 'movies', data }))
                   );
               }
               if (tvEnabled) {
                   bgFetchPromises.push(
                       fetchWithTimeout('/api/bulk/tv?pages=15&start=6', 90000).then(data => ({ type: 'tv', data }))
                   );
               }
               if (animeEnabled) {
                   bgFetchPromises.push(
                       fetchWithTimeout('/api/bulk/anime?pages=17&start=4', 60000).then(data => ({ type: 'anime', data }))
                   );
               }
               if (cartoonsEnabled) {
                   bgFetchPromises.push(
                       fetchWithTimeout('/api/bulk/cartoons?pages=10&start=6', 90000).then(data => ({ type: 'cartoons', data }))
                   );
               }
        
               Promise.all(bgFetchPromises).then((results) => {
                   let moreMovies = [], moreTV = [], moreAnime = [], moreCartoons = [];
                   results.forEach(result => {
                       if (result.type === 'movies') moreMovies = result.data || [];
                       if (result.type === 'tv') moreTV = result.data || [];
                       if (result.type === 'anime') moreAnime = result.data || [];
                       if (result.type === 'cartoons') moreCartoons = result.data || [];
                   });
            // Add more content as it arrives
            let moreContent = [
                ...(Array.isArray(moreMovies) ? moreMovies : []),
                ...(Array.isArray(moreTV) ? moreTV : []),
                ...(Array.isArray(moreAnime) ? moreAnime : []),
                ...(Array.isArray(moreCartoons) ? moreCartoons : [])
            ].filter(item => 
                item && 
                item.id && 
                item.title && 
                (item.posterUrl || item.backdropUrl)
                // Note: hasStreaming is set by the API when Cinetaro is enabled
            );
            
            // Filter based on enabled APIs
            moreContent = filterAPIContent(moreContent);
            
            // Filter out items without streaming
            moreContent = moreContent.filter(item => {
                // Remove items user confirmed don't work
                if (nonStreamableItems.has(item.id)) return false;
                
                // Keep local media (no source means local)
                if (!item.source || item.source === 'local') return true;
                
                // For API content, only keep if it has streaming
                return item.hasStreaming === true || !!item.streamingUrl;
            });
            
            // Deduplicate and add
            const existingIds = new Set(allAPIContent.map(m => `${m.type}-${m.id}`));
            const newItems = moreContent.filter(m => !existingIds.has(`${m.type}-${m.id}`));
            
            allAPIContent = [...allAPIContent, ...newItems];
            
            // Update display, filtering out non-streamable items
            const streamableAPIContentFull = allAPIContent.filter(item => {
                // Remove items user confirmed don't work
                if (nonStreamableItems.has(item.id)) return false;
                
                // Keep local media (no source means local)
                if (!item.source || item.source === 'local') return true;
                
                // For API content, only keep if it has streaming
                return item.hasStreaming === true || !!item.streamingUrl;
            });
            const combinedMediaFull = [...allMedia, ...streamableAPIContentFull];
            filteredMedia = combinedMediaFull;
            displayMedia();
            
            console.log(`✅ Background load complete: ${allAPIContent.length} total items`);
        }).catch(error => {
            console.warn('Background loading had some issues (but you already have content):', error);
        });
        
    } catch (error) {
        console.error('Error loading media:', error);
        console.error('Error details:', error.message, error.stack);
        const moviesGrid = document.getElementById('moviesGrid');
        if (moviesGrid) {
            moviesGrid.innerHTML = `
                <div class="empty-state">
                    <h3>Error Loading Media</h3>
                    <p>${error.message || 'Unknown error occurred'}</p>
                    <p style="margin-top: 10px; font-size: 12px; color: #999;">Check the browser console (F12) for more details.</p>
                    <button onclick="location.reload()" style="margin-top: 15px; padding: 10px 20px; background: #ff6600; color: white; border: none; border-radius: 4px; cursor: pointer;">Reload Page</button>
                </div>
            `;
        }
    }
}

// Load available genres
async function loadGenres() {
    try {
        const response = await fetch('/api/genres');
        if (response.ok) {
            const data = await response.json();
            availableGenres = data.genres || [];
            updateGenreFilter();
        }
    } catch (error) {
        console.warn('Error loading genres:', error);
    }
}

// Update genre filter UI
function updateGenreFilter() {
    const genreFilter = document.getElementById('genreFilter');
    if (!genreFilter) return;

    let html = '<option value="all">All Genres</option>';
    availableGenres.forEach(genre => {
        html += `<option value="${genre}" ${currentGenre === genre ? 'selected' : ''}>${genre}</option>`;
    });
    genreFilter.innerHTML = html;
}

// Display featured media (mix of local and API content - ONLY STREAMABLE)
async function displayFeatured() {
    const featuredGrid = document.getElementById('featuredGrid');
    if (!featuredGrid) return;
    
    try {
        // Get all streamable content (local + API with streaming)
        const streamableContent = [];
        
        // Add local media (always streamable)
        if (Array.isArray(allMedia) && allMedia.length > 0) {
            streamableContent.push(...allMedia);
        }
        
        // Add API content that has streaming
        if (Array.isArray(allAPIContent) && allAPIContent.length > 0) {
            const streamableAPI = allAPIContent.filter(item => 
                item.hasStreaming || item.streamingUrl
            );
            streamableContent.push(...streamableAPI);
        }
        
        // If we don't have enough from loaded content, try to get featured from API
        if (streamableContent.length < 8) {
            try {
                const response = await fetch('/api/featured');
                if (response.ok) {
                    const featured = await response.json();
                    if (Array.isArray(featured) && featured.length > 0) {
                        // Filter for streamable items only
                        const streamableFeatured = featured.filter(item => 
                            item.hasStreaming || item.streamingUrl || !item.source // Local items don't have source
                        );
                        // Add streamable featured items that aren't already in our list
                        const existingIds = new Set(streamableContent.map(m => m.id));
                        streamableFeatured.forEach(item => {
                            if (!existingIds.has(item.id)) {
                                streamableContent.push(item);
                            }
                        });
                    }
                }
            } catch (error) {
                console.warn('Could not fetch featured from API:', error);
            }
        }
        
        // Sort by: newest releases first, then by popularity (what's hot right now)
        streamableContent.sort((a, b) => {
            // First, prioritize by release date (newest first)
            const dateA = a.releaseDate || a.year || '1900-01-01';
            const dateB = b.releaseDate || b.year || '1900-01-01';
            const dateAObj = typeof dateA === 'string' ? new Date(dateA) : new Date(`${dateA}-01-01`);
            const dateBObj = typeof dateB === 'string' ? new Date(dateB) : new Date(`${dateB}-01-01`);
            const dateDiff = dateBObj - dateAObj;
            
            // If release dates are more than 30 days apart, prioritize newer
            if (Math.abs(dateDiff) > 30 * 24 * 60 * 60 * 1000) {
                return dateDiff;
            }
            
            // Otherwise, sort by popularity + rating (what's hot)
            const scoreA = (a.popularity || 0) + (a.rating || 0) * 10;
            const scoreB = (b.popularity || 0) + (b.rating || 0) * 10;
            return scoreB - scoreA;
        });
        
        // Take top 8 streamable items
        const featuredItems = streamableContent.slice(0, 8);
        
        if (featuredItems.length > 0) {
            featuredGrid.innerHTML = featuredItems.map(media => createMovieCard(media, true)).join('');
        } else {
            // No streamable content available
            const featuredSection = document.getElementById('featuredSection');
            if (featuredSection) {
                featuredSection.style.display = 'none';
            }
            return;
        }
    } catch (error) {
        console.warn('Error displaying featured:', error);
        // Hide featured section on error
        const featuredSection = document.getElementById('featuredSection');
        if (featuredSection) {
            featuredSection.style.display = 'none';
        }
        return;
    }
    
    if (featuredGrid.innerHTML.trim() === '') {
        const featuredSection = document.getElementById('featuredSection');
        if (featuredSection) {
            featuredSection.style.display = 'none';
        }
        return;
    }
    
    // Attach click listeners to featured cards
    featuredGrid.querySelectorAll('.movie-card').forEach(card => {
        card.addEventListener('click', () => {
            const mediaId = card.dataset.id;
            const mediaType = card.dataset.type || 'video';
            const mediaSource = card.dataset.source || 'local';
            openMediaPlayer(mediaId, mediaType, mediaSource);
        });
    });
}

// Display media grid
function displayMedia() {
    const moviesGrid = document.getElementById('moviesGrid');
    if (!moviesGrid) return;
    
    if (!Array.isArray(filteredMedia) || filteredMedia.length === 0) {
        moviesGrid.innerHTML = '<div class="empty-state">No media found. Add media files to your media directory.</div>';
        const pagination = document.getElementById('pagination');
        if (pagination) pagination.innerHTML = '';
        return;
    }
    
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageMedia = filteredMedia.slice(start, end);
    
    moviesGrid.innerHTML = pageMedia.map(media => createMovieCard(media, false)).join('');
    
    setupPagination();
    attachCardClickListeners();
}

// Create movie card HTML
function createMovieCard(media, isFeatured = false, progress = null) {
    // Determine thumbnail URL based on source
    let thumbnailUrl;
    if (media.source === 'tmdb' || media.source === 'jikan') {
        // API content has posterUrl
        thumbnailUrl = media.posterUrl || media.backdropUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzJhMmEyYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5Nb3ZpZSBQb3N0ZXI8L3RleHQ+PC9zdmc+';
    } else {
        // Local media
        thumbnailUrl = media.hasThumbnail 
            ? `/api/thumbnail/${media.id}` 
            : 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzJhMmEyYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5WaWRlbyBJY29uPC90ZXh0Pjwvc3ZnPg==';
    }
    
    // Extract year
    const year = media.year || 
                 (media.releaseDate ? media.releaseDate.split('-')[0] : null) ||
                 (media.title.match(/\b(19|20)\d{2}\b/) ? media.title.match(/\b(19|20)\d{2}\b/)[0] : null) ||
                 (media.createdAt ? new Date(media.createdAt).getFullYear() : null) ||
                 'Unknown';
    
    const duration = media.duration ? formatDuration(media.duration) : '';
    const rating = (media.rating && typeof media.rating === 'number') ? `⭐ ${media.rating.toFixed(1)}` : '';
    
    // Clean title
    let title = media.title;
    if (!media.source) {
        // Local media - remove year from title if present
        title = title.replace(/\s*\([^)]*\)\s*$/, '');
    }
    
    // Determine type
    const mediaType = media.type || 'video';
    const source = media.source || 'local';
    
    // Badge for source type - shows where the content comes from
    let badge = '';
    if (source === 'tmdb') {
        badge = '<span class="source-badge" title="From TMDB API (your API key)">TMDB</span>';
    } else if (source === 'jikan') {
        badge = '<span class="source-badge" title="From Jikan API (free, no key needed)">Anime</span>';
    } else if (source !== 'local') {
        badge = `<span class="source-badge">${source.toUpperCase()}</span>`;
    }
    
    // Watch badge - show for local files and API content with streaming
    // Local files: source is 'local' or undefined (no source means local)
    // API content: show watch badge if streaming is available
    const isLocalFile = !media.source || source === 'local';
    const hasStreaming = media.hasStreaming || media.streamingUrl;
    const watchBadge = (isLocalFile || hasStreaming) ? `<span class="watch-badge">▶️ Watch</span>` : '';
    
    // Favorite button (only show if user is logged in)
    let favoriteBtn = '';
    if (currentUser && typeof isFavorited === 'function') {
        const isFav = isFavorited(media.id);
        const favIcon = isFav ? '❤️' : '🤍';
        favoriteBtn = `<button class="favorite-btn ${isFav ? 'active' : ''}" data-favorite-id="${media.id}" onclick="toggleFavorite(event, '${media.id}')" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">${favIcon}</button>`;
    }
    
    // Collection button (only show if user is logged in and has collections)
    let collectionBtn = '';
    if (currentUser && collections && collections.length > 0) {
        collectionBtn = `<button class="collection-btn" onclick="showAddToCollectionMenu(event, '${media.id}')" title="Add to collection" style="position: absolute; top: 10px; right: 50px; background: rgba(0,0,0,0.7); border: none; color: white; padding: 8px; border-radius: 50%; cursor: pointer; font-size: 16px;">📁</button>`;
    }
    
    // Progress bar for continue watching
    let progressBar = '';
    if (progress !== null && progress !== undefined && typeof progress === 'number' && progress > 0 && progress < 100) {
        progressBar = `
            <div class="progress-bar">
                <div style="width: ${progress}%"></div>
            </div>
        `;
    }
    
    return `
        <div class="movie-card" data-id="${media.id}" data-type="${mediaType}" data-source="${source}">
            ${badge}
            ${watchBadge}
            ${favoriteBtn}
            <img src="${thumbnailUrl}" alt="${title}" class="movie-thumbnail" 
                 onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzJhMmEyYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5WaWRlbyBJY29uPC90ZXh0Pjwvc3ZnPg=='">
            ${progressBar}
            <div class="movie-info">
                <div class="movie-title">${title}</div>
                <div class="movie-year">${year}${duration ? ' • ' + duration : ''}${rating ? ' • ' + rating : ''}</div>
            </div>
        </div>
    `;
}

// Attach click listeners to movie cards
function attachCardClickListeners() {
    document.querySelectorAll('.movie-card').forEach(card => {
        card.addEventListener('click', () => {
            const mediaId = card.dataset.id;
            const mediaType = card.dataset.type;
            const source = card.dataset.source || 'local';
            openMediaPlayer(mediaId, mediaType, source);
        });
    });
}

// Open media player
async function openMediaPlayer(mediaId, mediaType, source = 'local') {
    const videoPlayer = document.getElementById('videoPlayer');
    const cinetaroPlayer = document.getElementById('cinetaroPlayer');
    const videoModal = document.getElementById('videoModal');
    const videoInfo = document.getElementById('videoInfo');
    const subtitleSelector = document.getElementById('subtitleSelector');
    const subtitleSelect = document.getElementById('subtitleLang');
    
    // Reset players
    videoPlayer.style.display = 'none';
    cinetaroPlayer.style.display = 'none';
    videoPlayer.src = '';
    cinetaroPlayer.src = '';
    subtitleSelector.style.display = 'none';
    subtitleSelect.innerHTML = '<option value="">None</option>';
    
    // Find media in all content
    const allContent = [...allMedia, ...allAPIContent];
    const media = allContent.find(m => m.id === mediaId);
    if (!media) {
        console.error('Media not found:', mediaId);
        return;
    }
    
    // Determine if this is API content (has source property)
    const isAPIContent = media.source && (media.source === 'tmdb' || media.source === 'jikan');
    
    // Store current media info for history tracking
    currentMediaId = mediaId;
    currentMediaType = mediaType;
    
    // Reset episode selector
    const episodeSelector = document.getElementById('episodeSelector');
    if (episodeSelector) episodeSelector.style.display = 'none';
    currentSeason = 1;
    currentEpisode = 1;
    tvShowDetails = null;
    tvShowSeasons = [];
    tvShowEpisodes = [];
    
    // Show loading state
    videoInfo.innerHTML = '<div class="loading">Loading player...</div>';
    const playerControls = document.getElementById('playerControls');
    if (playerControls) playerControls.style.display = 'block';
    const reportBtn = document.getElementById('reportBtn');
    if (reportBtn) reportBtn.style.display = 'none';
    
    // For TV shows, fetch show details (seasons/episodes) first
    if (mediaType === 'tv' && media.tmdbId) {
        try {
            const detailsResponse = await fetch(`/api/tv/${mediaId}/details`);
            if (detailsResponse.ok) {
                tvShowDetails = await detailsResponse.json();
                tvShowSeasons = tvShowDetails.seasons || [];
                // Load episodes for season 1
                await loadSeasonEpisodes(currentSeason);
            }
        } catch (error) {
            console.warn('Could not fetch TV show details:', error);
        }
    }
    
    // For API content, always try to get streaming URL (even if not in initial data)
    if (isAPIContent && (source !== 'local')) {
        // Try to get/fetch streaming URL from server
        let streamingUrl = media.streamingUrl;
        let streamingError = null;
        
        // For TV shows, use current season/episode for URL
        const seasonParam = mediaType === 'tv' ? currentSeason : 1;
        const episodeParam = mediaType === 'tv' ? currentEpisode : 1;
        
        // If no streaming URL in media object, try to fetch it
        if (!streamingUrl && media.tmdbId) {
            try {
                // Check localStorage cache first (for this specific season/episode)
                const cacheKey = `streaming_${mediaId}_s${seasonParam}_e${episodeParam}`;
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    const cachedData = JSON.parse(cached);
                    // Use cache if less than 24 hours old
                    if (Date.now() - cachedData.timestamp < 24 * 60 * 60 * 1000) {
                        streamingUrl = cachedData.streamingUrl;
                    }
                }
                
                // If not cached, fetch from server
                if (!streamingUrl) {
                    const streamingParams = new URLSearchParams({
                        type: media.type || 'movie',
                        season: seasonParam.toString(),
                        episode: episodeParam.toString()
                    });
                    const streamingResponse = await fetch(`/api/streaming/${mediaId}?${streamingParams}`);
                    if (streamingResponse.ok) {
                        const streamingData = await streamingResponse.json();
                        streamingUrl = streamingData.streamingUrl;
                        // Cache the result
                        if (streamingUrl) {
                            localStorage.setItem(cacheKey, JSON.stringify({
                                streamingUrl,
                                timestamp: Date.now()
                            }));
                        }
                    } else {
                        const errorData = await streamingResponse.json().catch(() => ({}));
                        streamingError = errorData.error || 'Streaming not available';
                        // Cache the failure (shorter cache time - 1 hour)
                        localStorage.setItem(cacheKey, JSON.stringify({
                            streamingUrl: null,
                            error: streamingError,
                            timestamp: Date.now()
                        }));
                    }
                }
            } catch (error) {
                console.warn('Could not fetch streaming URL:', error);
                streamingError = 'Failed to connect to streaming service';
            }
        } else if (mediaType === 'tv' && streamingUrl) {
            // Update existing URL with season/episode params
            try {
                const url = new URL(streamingUrl);
                url.searchParams.set('season', seasonParam.toString());
                url.searchParams.set('episode', episodeParam.toString());
                streamingUrl = url.toString();
            } catch (e) {
                // If URL parsing fails, rebuild it
                streamingUrl = `/api/streaming/${mediaId}?type=tv&season=${seasonParam}&episode=${episodeParam}`;
            }
        }
        
        // Show Cinetaro iframe player if we have a streaming URL
        if (streamingUrl) {
            cinetaroPlayer.src = streamingUrl;
            cinetaroPlayer.style.display = 'block';
            
            // Show episode selector for TV shows
            if (mediaType === 'tv' && tvShowDetails && tvShowSeasons.length > 0) {
                setupEpisodeSelector();
                const episodeSelectorEl = document.getElementById('episodeSelector');
                if (episodeSelectorEl) episodeSelectorEl.style.display = 'block';
            }
            
            // Show subtitle selector if subtitles are available
            if (media.subtitles && Array.isArray(media.subtitles) && media.subtitles.length > 0) {
                let subtitleOptions = '<option value="">Default</option>';
                media.subtitles.forEach(sub => {
                    const label = typeof sub === 'string' ? sub.charAt(0).toUpperCase() + sub.slice(1) : sub;
                    subtitleOptions += `<option value="${sub}">${label}</option>`;
                });
                subtitleSelect.innerHTML = subtitleOptions;
                subtitleSelector.style.display = 'block';
            }
            
            // Fetch enriched details (with OMDb data) if available
            let enrichedMedia = media;
            try {
                const detailsResponse = await fetch(`/api/media/${mediaId}/details`);
                if (detailsResponse.ok) {
                    enrichedMedia = await detailsResponse.json();
                }
            } catch (error) {
                console.warn('Could not fetch enriched details:', error);
                // Use original media data
            }
            
            // Show media info with player (use enriched data)
            const currentEpInfo = mediaType === 'tv' && tvShowEpisodes.length > 0 
                ? tvShowEpisodes.find(ep => ep.episodeNumber === currentEpisode)
                : null;
            
            // Format ratings display
            let ratingsDisplay = '';
            if (enrichedMedia.imdbRating) {
                ratingsDisplay += `<span style="margin-right: 15px;">⭐ IMDb: ${enrichedMedia.imdbRating.toFixed(1)}/10</span>`;
            }
            if (enrichedMedia.rating && enrichedMedia.rating !== enrichedMedia.imdbRating) {
                ratingsDisplay += `<span style="margin-right: 15px;">⭐ TMDB: ${enrichedMedia.rating.toFixed(1)}/10</span>`;
            }
            if (enrichedMedia.metascore) {
                ratingsDisplay += `<span>Metascore: ${enrichedMedia.metascore}/100</span>`;
            }
            if (!ratingsDisplay && media.rating) {
                ratingsDisplay = `⭐ ${media.rating.toFixed(1)}/10`;
            }
            
            videoInfo.innerHTML = `
                <h3>${enrichedMedia.title || media.title}${mediaType === 'tv' ? ` - S${currentSeason}E${currentEpisode}` : ''}</h3>
                ${currentEpInfo && currentEpInfo.name ? `<p><strong>Episode:</strong> ${currentEpInfo.name}</p>` : ''}
                <div style="display: flex; flex-wrap: wrap; gap: 10px; margin: 10px 0;">
                    ${enrichedMedia.year || media.year ? `<span><strong>Year:</strong> ${enrichedMedia.year || media.year}</span>` : ''}
                    ${enrichedMedia.runtime || media.runtime ? `<span><strong>Runtime:</strong> ${enrichedMedia.runtime || media.runtime}</span>` : ''}
                    ${enrichedMedia.rated ? `<span><strong>Rated:</strong> ${enrichedMedia.rated}</span>` : ''}
                    ${ratingsDisplay ? `<div style="margin-top: 5px;">${ratingsDisplay}</div>` : ''}
                </div>
                ${enrichedMedia.director || media.director ? `<p><strong>Director:</strong> ${enrichedMedia.director || media.director}</p>` : ''}
                ${enrichedMedia.actors || media.actors ? `<p><strong>Cast:</strong> ${(enrichedMedia.actors || media.actors).split(',').slice(0, 5).join(', ')}</p>` : ''}
                ${enrichedMedia.writer ? `<p><strong>Writer:</strong> ${enrichedMedia.writer}</p>` : ''}
                ${enrichedMedia.genres && enrichedMedia.genres.length > 0 ? `<p><strong>Genres:</strong> ${enrichedMedia.genres.join(', ')}</p>` : (media.genres && media.genres.length > 0 ? `<p><strong>Genres:</strong> ${media.genres.join(', ')}</p>` : '')}
                ${enrichedMedia.awards ? `<p><strong>Awards:</strong> ${enrichedMedia.awards}</p>` : ''}
                ${enrichedMedia.boxOffice ? `<p><strong>Box Office:</strong> ${enrichedMedia.boxOffice}</p>` : ''}
                ${tvShowDetails ? `<p><strong>Total Seasons:</strong> ${tvShowDetails.totalSeasons} | <strong>Total Episodes:</strong> ${tvShowDetails.totalEpisodes}</p>` : ''}
                ${enrichedMedia.country ? `<p><strong>Country:</strong> ${enrichedMedia.country}</p>` : ''}
                ${enrichedMedia.language ? `<p><strong>Language:</strong> ${enrichedMedia.language}</p>` : ''}
                ${currentEpInfo && currentEpInfo.overview ? `<p class="overview"><strong>Episode Overview:</strong><br>${currentEpInfo.overview}</p>` : ''}
                ${!currentEpInfo && (enrichedMedia.overview || media.overview) ? `<p class="overview"><strong>Overview:</strong><br>${enrichedMedia.overview || media.overview}</p>` : ''}
            `;
        } else {
            // No streaming available - show better error message
            const errorMsg = streamingError || 'This content is not available in the streaming library. Cinetaro (our streaming provider) may not have this title yet.';
            videoInfo.innerHTML = `
                <h3>${media.title}</h3>
                ${media.year ? `<p><strong>Year:</strong> ${media.year}</p>` : ''}
                ${media.rating ? `<p><strong>Rating:</strong> ⭐ ${media.rating.toFixed(1)}</p>` : ''}
                ${media.genres && media.genres.length > 0 ? `<p><strong>Genres:</strong> ${media.genres.join(', ')}</p>` : ''}
                ${media.episodes ? `<p><strong>Episodes:</strong> ${media.episodes}</p>` : ''}
                ${media.overview ? `<p class="overview"><strong>Overview:</strong><br>${media.overview}</p>` : ''}
                <div class="error-message" style="margin-top: 20px; padding: 15px; background: #ff6b6b; color: white; border-radius: 8px;">
                    <strong>⚠️ Streaming Not Available</strong><br>
                    <p style="margin: 10px 0 0 0; font-size: 14px;">${errorMsg}</p>
                    <p style="margin: 10px 0 0 0; font-size: 14px;">To watch this content, add the video file to your local <code>media</code> directory.</p>
                </div>
            `;
            // Show report button
            if (reportBtn && currentUser) {
                reportBtn.style.display = 'inline-block';
            }
        }
        
        videoModal.style.display = 'block';
    } else if (source === 'local' || (!source && !isAPIContent)) {
        // Local media file
        if (mediaType === 'video' || mediaType === 'audio') {
            videoPlayer.src = `/api/stream/${mediaId}`;
            videoInfo.innerHTML = `
                <h3>${media.title}</h3>
                ${media.duration ? `<p>Duration: ${formatDuration(media.duration)}</p>` : ''}
                ${media.resolution ? `<p>Resolution: ${media.resolution.width}x${media.resolution.height}</p>` : ''}
                ${media.overview ? `<p class="overview">${media.overview}</p>` : ''}
            `;
            
            // Add subtitle tracks if available
            if (media.subtitles && Array.isArray(media.subtitles) && media.subtitles.length > 0) {
                media.subtitles.forEach(sub => {
                    const option = document.createElement('option');
                    option.value = sub.src || sub;
                    option.textContent = sub.label || sub;
                    subtitleSelect.appendChild(option);
                });
                subtitleSelector.style.display = 'block';
            }
            
            videoModal.style.display = 'block';
            videoPlayer.style.display = 'block';
            
            // Check for resume position
            if (currentUser) {
                try {
                    const resumeResponse = await fetch(`/api/resume/${mediaId}`);
                    if (resumeResponse.ok) {
                        const resumeData = await resumeResponse.json();
                        if (resumeData.position > 0 && resumeData.progress < 90) {
                            const resumeBtn = document.getElementById('resumeBtn');
                            if (resumeBtn) {
                                resumeBtn.style.display = 'inline-block';
                                resumeBtn.onclick = () => {
                                    videoPlayer.currentTime = resumeData.position;
                                    resumeBtn.style.display = 'none';
                                    videoPlayer.play();
                                };
                            }
                        }
                    }
                } catch (error) {
                    console.warn('Could not get resume position:', error);
                }
            }
            
            // Start tracking watch history
            if (currentUser) {
                watchHistoryInterval = setInterval(saveWatchHistory, 30000); // Save every 30 seconds
            }
            
            videoPlayer.play();
        } else {
            alert('Audio playback coming soon!');
        }
    }
}

// Close video modal
function closeVideoModal() {
    const videoModal = document.getElementById('videoModal');
    const videoPlayer = document.getElementById('videoPlayer');
    const cinetaroPlayer = document.getElementById('cinetaroPlayer');
    const videoInfo = document.getElementById('videoInfo');
    const playerControls = document.getElementById('playerControls');
    const reportBtn = document.getElementById('reportBtn');
    const resumeBtn = document.getElementById('resumeBtn');
    
    // Save watch history and clear interval
    if (currentUser && currentMediaId) {
        saveWatchHistory();
        if (watchHistoryInterval) {
            clearInterval(watchHistoryInterval);
            watchHistoryInterval = null;
        }
    }
    
    videoModal.style.display = 'none';
    videoPlayer.pause();
    videoPlayer.src = '';
    videoPlayer.style.display = 'none';
    cinetaroPlayer.src = '';
    cinetaroPlayer.style.display = 'none';
    const subtitleSelector = document.getElementById('subtitleSelector');
    if (subtitleSelector) subtitleSelector.style.display = 'none';
    if (playerControls) playerControls.style.display = 'none';
    if (reportBtn) reportBtn.style.display = 'none';
    if (resumeBtn) resumeBtn.style.display = 'none';
    videoInfo.innerHTML = '';
    currentMediaId = null;
    currentMediaType = null;
    currentSeason = 1;
    currentEpisode = 1;
    tvShowDetails = null;
    tvShowSeasons = [];
    tvShowEpisodes = [];
}

// Load episodes for a specific season
async function loadSeasonEpisodes(seasonNumber) {
    if (!currentMediaId || !tvShowDetails) return;
    
    try {
        const response = await fetch(`/api/tv/${currentMediaId}/season/${seasonNumber}`);
        if (response.ok) {
            const seasonData = await response.json();
            tvShowEpisodes = seasonData.episodes || [];
            updateEpisodeSelect();
        }
    } catch (error) {
        console.warn('Could not load season episodes:', error);
        tvShowEpisodes = [];
    }
}

// Setup episode selector dropdowns
function setupEpisodeSelector() {
    const seasonSelect = document.getElementById('seasonSelect');
    const episodeSelect = document.getElementById('episodeSelect');
    
    if (!seasonSelect || !episodeSelect || !tvShowSeasons.length) return;
    
    // Populate seasons
    seasonSelect.innerHTML = '';
    tvShowSeasons.forEach(season => {
        const option = document.createElement('option');
        option.value = season.seasonNumber;
        option.textContent = `${season.name} (${season.episodeCount} episodes)`;
        if (season.seasonNumber === currentSeason) option.selected = true;
        seasonSelect.appendChild(option);
    });
    
    // Populate episodes
    updateEpisodeSelect();
}

// Update episode select dropdown
function updateEpisodeSelect() {
    const episodeSelect = document.getElementById('episodeSelect');
    if (!episodeSelect) return;
    
    episodeSelect.innerHTML = '';
    tvShowEpisodes.forEach(ep => {
        const option = document.createElement('option');
        option.value = ep.episodeNumber;
        option.textContent = `E${ep.episodeNumber}: ${ep.name || `Episode ${ep.episodeNumber}`}`;
        if (ep.episodeNumber === currentEpisode) option.selected = true;
        episodeSelect.appendChild(option);
    });
    
    // Update next episode button state
    updateNextEpisodeButton();
}

// Update next episode button (disable if last episode)
function updateNextEpisodeButton() {
    const nextBtn = document.getElementById('nextEpisodeBtn');
    if (!nextBtn) return;
    
    const isLastEpisode = currentEpisode >= tvShowEpisodes.length;
    const isLastSeason = !tvShowSeasons.find(s => s.seasonNumber > currentSeason);
    
    if (isLastEpisode && isLastSeason) {
        nextBtn.disabled = true;
        nextBtn.textContent = '▶️ Last Episode';
        nextBtn.style.opacity = '0.5';
        nextBtn.style.cursor = 'not-allowed';
    } else {
        nextBtn.disabled = false;
        nextBtn.textContent = '▶️ Next Episode';
        nextBtn.style.opacity = '1';
        nextBtn.style.cursor = 'pointer';
    }
}

// Change season
async function changeSeason(seasonNumber) {
    currentSeason = parseInt(seasonNumber);
    currentEpisode = 1; // Reset to episode 1 when changing seasons
    await loadSeasonEpisodes(currentSeason);
    await loadEpisodeStream();
}

// Change episode
async function changeEpisode(episodeNumber) {
    currentEpisode = parseInt(episodeNumber);
    await loadEpisodeStream();
}

// Play next episode
async function playNextEpisode() {
    const nextEpisode = currentEpisode + 1;
    
    // Check if next episode exists in current season
    if (nextEpisode <= tvShowEpisodes.length) {
        currentEpisode = nextEpisode;
        await loadEpisodeStream();
    } else {
        // Move to next season, episode 1
        const nextSeason = tvShowSeasons.find(s => s.seasonNumber > currentSeason);
        if (nextSeason) {
            currentSeason = nextSeason.seasonNumber;
            currentEpisode = 1;
            await loadSeasonEpisodes(currentSeason);
            await loadEpisodeStream();
        }
    }
}

// Load stream for current episode
async function loadEpisodeStream() {
    if (!currentMediaId || currentMediaType !== 'tv') return;
    
    const cinetaroPlayer = document.getElementById('cinetaroPlayer');
    const videoInfo = document.getElementById('videoInfo');
    const allContent = [...allMedia, ...allAPIContent];
    const media = allContent.find(m => m.id === currentMediaId);
    
    if (!media || !cinetaroPlayer) return;
    
    try {
        // Show loading
        if (videoInfo) {
            videoInfo.innerHTML = `<div class="loading">Loading Season ${currentSeason}, Episode ${currentEpisode}...</div>`;
        }
        
        // Fetch streaming URL for this episode
        const streamingParams = new URLSearchParams({
            type: 'tv',
            season: currentSeason.toString(),
            episode: currentEpisode.toString()
        });
        
        const response = await fetch(`/api/streaming/${currentMediaId}?${streamingParams}`);
        if (response.ok) {
            const streamingData = await response.json();
            if (streamingData.streamingUrl) {
                cinetaroPlayer.src = streamingData.streamingUrl;
                
                // Update episode info
                const currentEpInfo = tvShowEpisodes.find(ep => ep.episodeNumber === currentEpisode);
                if (videoInfo) {
                    videoInfo.innerHTML = `
                        <h3>${media.title} - S${currentSeason}E${currentEpisode}</h3>
                        ${currentEpInfo && currentEpInfo.name ? `<p><strong>Episode:</strong> ${currentEpInfo.name}</p>` : ''}
                        ${media.year ? `<p><strong>Year:</strong> ${media.year}</p>` : ''}
                        ${media.rating ? `<p><strong>Rating:</strong> ⭐ ${media.rating.toFixed(1)}</p>` : ''}
                        ${currentEpInfo && currentEpInfo.overview ? `<p class="overview"><strong>Episode Overview:</strong><br>${currentEpInfo.overview}</p>` : ''}
                    `;
                }
                
                // Update selects
                updateEpisodeSelect();
            } else {
                if (videoInfo) {
                    videoInfo.innerHTML = `<p style="color: #ff6b6b;">Streaming not available for Season ${currentSeason}, Episode ${currentEpisode}</p>`;
                }
            }
        }
    } catch (error) {
        console.error('Error loading episode stream:', error);
        if (videoInfo) {
            videoInfo.innerHTML = `<p style="color: #ff6b6b;">Error loading episode</p>`;
        }
    }
}

// Save watch history
let currentMediaId = null;
let currentMediaType = null;
let watchHistoryInterval = null;

async function saveWatchHistory() {
    if (!currentUser || !currentMediaId) return;
    
    const videoPlayer = document.getElementById('videoPlayer');
    if (!videoPlayer || !videoPlayer.src) return;
    
    try {
        const position = Math.floor(videoPlayer.currentTime || 0);
        const duration = Math.floor(videoPlayer.duration || 0);
        
        await fetch('/api/watch-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mediaId: currentMediaId,
                mediaType: currentMediaType,
                position,
                duration
            })
        });
    } catch (error) {
        console.warn('Could not save watch history:', error);
    }
}

// Report non-streamable content
async function reportNonStreamable() {
    if (!currentUser) {
        alert('Please login to report issues');
        return;
    }
    
    if (!currentMediaId) return;
    
    try {
        const response = await fetch('/api/report-non-streamable', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mediaId: currentMediaId })
        });
        
        if (response.ok) {
            // Mark as non-streamable and hide
            nonStreamableItems.add(currentMediaId);
            const card = document.querySelector(`[data-id="${currentMediaId}"]`);
            if (card) {
                card.style.display = 'none';
            }
            alert('Thank you for reporting! This content has been hidden.');
            closeVideoModal();
        }
    } catch (error) {
        console.error('Error reporting:', error);
        alert('Failed to report. Please try again.');
    }
}

// Resume playback
async function resumePlayback() {
    if (!currentUser || !currentMediaId) return;
    
    try {
        const response = await fetch(`/api/resume/${currentMediaId}`);
        if (response.ok) {
            const data = await response.json();
            const videoPlayer = document.getElementById('videoPlayer');
            if (videoPlayer && data.position > 0) {
                videoPlayer.currentTime = data.position;
                const resumeBtn = document.getElementById('resumeBtn');
                if (resumeBtn) resumeBtn.style.display = 'none';
            }
        }
    } catch (error) {
        console.warn('Could not get resume position:', error);
    }
}

// Change playback speed
function changePlaybackSpeed(speed) {
    const videoPlayer = document.getElementById('videoPlayer');
    if (videoPlayer) {
        videoPlayer.playbackRate = parseFloat(speed);
    }
}

// Load similar content
async function loadSimilarContent(mediaId) {
    try {
        const response = await fetch(`/api/similar/${mediaId}`);
        if (response.ok) {
            const similar = await response.json();
            const similarDiv = document.getElementById('similarContent');
            if (similarDiv && similar.length > 0) {
                similarDiv.innerHTML = `
                    <h4 style="margin-bottom: 10px; color: #ff6600;">Similar Content</h4>
                    <div class="featured-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 15px;">
                        ${similar.slice(0, 6).map(media => createMovieCard(media, true)).join('')}
                    </div>
                `;
                
                // Attach click listeners
                similarDiv.querySelectorAll('.movie-card').forEach(card => {
                    card.addEventListener('click', () => {
                        const id = card.dataset.id;
                        const type = card.dataset.type || 'video';
                        const source = card.dataset.source || 'local';
                        openMediaPlayer(id, type, source);
                    });
                });
            }
        }
    } catch (error) {
        console.warn('Could not load similar content:', error);
    }
}

// Setup keyboard shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        const videoModal = document.getElementById('videoModal');
        if (videoModal && videoModal.style.display !== 'none') {
            const videoPlayer = document.getElementById('videoPlayer');
            
            // Space bar - play/pause
            if (e.code === 'Space' && videoPlayer && videoPlayer.src) {
                e.preventDefault();
                if (videoPlayer.paused) {
                    videoPlayer.play();
                } else {
                    videoPlayer.pause();
                }
            }
            
            // Arrow keys - seek
            if (videoPlayer && videoPlayer.src) {
                if (e.code === 'ArrowLeft') {
                    e.preventDefault();
                    videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 10);
                } else if (e.code === 'ArrowRight') {
                    e.preventDefault();
                    videoPlayer.currentTime = Math.min(videoPlayer.duration, videoPlayer.currentTime + 10);
                }
            }
            
            // Escape - close modal
            if (e.code === 'Escape') {
                closeVideoModal();
            }
        }
    });
}

// Change subtitle language
async function changeSubtitle(lang) {
    const cinetaroPlayer = document.getElementById('cinetaroPlayer');
    if (!cinetaroPlayer || !cinetaroPlayer.src || lang === '') return;
    
    // Update the streaming URL with new subtitle language
    // The URL format for Cinetaro already includes language in the path
    // We need to update it
    const currentUrl = cinetaroPlayer.src;
    // Extract media info and rebuild URL with new language
    // For now, just reload with the new language parameter
    // This would need to be implemented based on Cinetaro's URL structure
    console.log('Changing subtitle to:', lang);
    // The actual implementation would update the iframe src with the new language
}

// Close modal when clicking outside
window.addEventListener('click', (event) => {
    const modal = document.getElementById('videoModal');
    if (event.target === modal) {
        closeVideoModal();
    }
});

// Filter media
async function filterMedia(filterType) {
    currentFilter = filterType;
    currentPage = 1;
    
    // Update active filter tab
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    const activeTab = document.querySelector(`[data-filter="${filterType}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }
    
    // Get base media (combine local and API, respecting current genre filter)
    // Only include API content that has streaming available
    const streamableAPI = allAPIContent.filter(item => {
        // Remove items user confirmed don't work
        if (nonStreamableItems.has(item.id)) return false;
        
        // Keep local media (no source means local)
        if (!item.source || item.source === 'local') return true;
        
        // For API content, only keep if it has streaming
        return item.hasStreaming === true || !!item.streamingUrl;
    });
    let baseMedia = [...allMedia, ...streamableAPI];
    
    // Apply genre filter if set
    if (currentGenre && currentGenre !== 'all') {
        baseMedia = baseMedia.filter(m => {
            const genres = m.genres || [];
            return genres.some(g => g.toLowerCase() === currentGenre.toLowerCase());
        });
    }
    
    // Apply filter type
    switch (filterType) {
        case 'recent':
            filteredMedia = baseMedia.sort((a, b) => {
                const dateA = a.modifiedAt || a.releaseDate || '0';
                const dateB = b.modifiedAt || b.releaseDate || '0';
                return new Date(dateB) - new Date(dateA);
            });
            break;
        case 'popular':
            // Sort by popularity/rating
            filteredMedia = baseMedia.sort((a, b) => {
                const scoreA = (b.popularity || 0) + (b.rating || 0) * 10 || (b.size || 0);
                const scoreB = (a.popularity || 0) + (a.rating || 0) * 10 || (a.size || 0);
                return scoreB - scoreA;
            });
            break;
        case 'az':
            filteredMedia = baseMedia.sort((a, b) => 
                a.title.localeCompare(b.title)
            );
            break;
        case 'year':
            filteredMedia = baseMedia.sort((a, b) => {
                const yearA = a.year || a.title.match(/\b(19|20)\d{2}\b/)?.[0] || '0';
                const yearB = b.year || b.title.match(/\b(19|20)\d{2}\b/)?.[0] || '0';
                return yearB.localeCompare(yearA);
            });
            break;
        default:
            filteredMedia = baseMedia;
    }
    
    displayMedia();
}

// Filter by genre
async function filterByGenre(genre) {
    currentGenre = genre;
    currentPage = 1;
    
    // Reload all media with genre filter from server
    try {
        // Get all pages or at least first few pages to have enough media
        const url = genre === 'all' 
            ? '/api/media/all?page=1'
            : `/api/media/all?page=1&genre=${encodeURIComponent(genre)}`;
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            // Update the base media arrays so filters work correctly
            // Split back into local and API content
            const serverMedia = data.results || [];
            allAPIContent = serverMedia.filter(m => m.source);
            // Keep local media separate for streaming
            // Now apply current filter type to the filtered results
            await filterMedia(currentFilter);
        } else {
            // Fallback to client-side filtering
            await filterMedia(currentFilter);
        }
    } catch (error) {
        console.error('Error filtering by genre:', error);
        // Fallback to client-side filtering
        await filterMedia(currentFilter);
    }
}

// Filter by media type (Movies, Shows)
function filterByType(type) {
    currentPage = 1;
    
    // Update nav active state
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    if (type === 'movie') {
        document.getElementById('moviesNavLink')?.classList.add('active');
    } else if (type === 'tv') {
        document.getElementById('showsNavLink')?.classList.add('active');
    }
    
    // Filter media by type
    let baseMedia = [...allMedia, ...allAPIContent];
    
    if (type === 'movie') {
        filteredMedia = baseMedia.filter(m => m.type === 'movie' || (m.source && !m.type) || (!m.source && !m.type));
    } else if (type === 'tv') {
        filteredMedia = baseMedia.filter(m => m.type === 'tv' || m.type === 'anime');
    } else {
        filteredMedia = baseMedia;
    }
    
    // Apply genre filter if set
    if (currentGenre && currentGenre !== 'all') {
        filteredMedia = filteredMedia.filter(m => {
            const genres = m.genres || [];
            return genres.some(g => g.toLowerCase() === currentGenre.toLowerCase());
        });
    }
    
    // Reset filter tabs
    document.querySelectorAll('.filter-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelector('[data-filter="all"]')?.classList.add('active');
    currentFilter = 'all';
    
    displayMedia();
}

// Search functionality
async function performSearch() {
    const searchTerm = document.getElementById('searchInput').value.trim();
    
    if (!searchTerm) {
        clearSearch();
        return;
    }
    
    // Save to search history
    saveSearchHistory(searchTerm);
    
    // Hide suggestions
    hideSearchSuggestions();
    
    // Search local media first
    const localResults = allMedia.filter(media => {
        const titleMatch = media.title.toLowerCase().includes(searchTerm.toLowerCase());
        // Apply filters
        if (!titleMatch) return false;
        const type = media.type || 'movie';
        if (type === 'movie' && !searchFilters.movies) return false;
        if (type === 'tv' && !searchFilters.tv) return false;
        if (type === 'anime' && !searchFilters.anime) return false;
        return true;
    });
    
    // Search API content with filters
    let apiResults = await searchMedia(searchTerm, false);
    
    // Combine results and deduplicate
    const combinedResults = [...localResults, ...apiResults];
    filteredMedia = combinedResults;
    
    currentPage = 1;
    currentFilter = 'all';
    currentGenre = 'all'; // Reset genre filter when searching
    
    // Reset filter tabs
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    const allTab = document.querySelector('[data-filter="all"]');
    if (allTab) allTab.classList.add('active');
    
    // Show results count
    const resultsCount = document.getElementById('resultsCount');
    if (resultsCount) {
        resultsCount.textContent = `Found ${combinedResults.length} result${combinedResults.length !== 1 ? 's' : ''} for "${searchTerm}"`;
        resultsCount.style.display = 'block';
    }
    
    // Hide featured section when searching
    const featuredSection = document.getElementById('featuredSection');
    if (featuredSection) {
        featuredSection.style.display = 'none';
    }
    
    displayMedia();
}

// Setup pagination
function setupPagination() {
    const totalPages = Math.ceil(filteredMedia.length / itemsPerPage);
    const pagination = document.getElementById('pagination');
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let paginationHTML = '';
    
    // Previous button
    if (currentPage > 1) {
        paginationHTML += `<a href="#" class="pagination-link" onclick="changePage(${currentPage - 1}); return false;">« Prev</a>`;
    }
    
    // Page numbers
    const maxVisiblePages = 10;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage < maxVisiblePages - 1) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `<a href="#" class="pagination-link ${i === currentPage ? 'active' : ''}" 
            onclick="changePage(${i}); return false;">${i}</a>`;
    }
    
    // Next button
    if (currentPage < totalPages) {
        paginationHTML += `<a href="#" class="pagination-link" onclick="changePage(${currentPage + 1}); return false;">Next »</a>`;
    }
    
    pagination.innerHTML = paginationHTML;
}

// Change page
function changePage(page) {
    currentPage = page;
    displayMedia();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Format duration
function formatDuration(seconds) {
    if (!seconds) return '';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m ${secs}s`;
}

// ========== Authentication Functions ==========

// Check if user is authenticated
async function checkAuth() {
    try {
        const response = await fetch('/api/auth/me', {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user || data;
            await updateUIAuthState(true);
            await loadFavorites();
        } else {
            currentUser = null;
            await updateUIAuthState(false);
        }
    } catch (error) {
        console.error('Auth check error:', error);
        currentUser = null;
        await updateUIAuthState(false);
    }
}

// Update UI based on auth state
async function updateUIAuthState(isAuthenticated) {
    const authButtons = document.getElementById('authButtons');
    const userMenu = document.getElementById('userMenu');
    const favoritesNavLink = document.getElementById('favoritesNavLink');
    const collectionsNavLink = document.getElementById('collectionsNavLink');
    
    if (isAuthenticated && currentUser) {
        authButtons.style.display = 'none';
        userMenu.style.display = 'block';
        if (favoritesNavLink) favoritesNavLink.style.display = 'inline-block';
        if (collectionsNavLink) collectionsNavLink.style.display = 'inline-block';
        document.getElementById('userDisplayName').textContent = currentUser.displayName || currentUser.username;
        await loadCollections();
        await loadContinueWatching();
        await loadRecommendations();
    } else {
        authButtons.style.display = 'flex';
        userMenu.style.display = 'none';
        if (favoritesNavLink) favoritesNavLink.style.display = 'none';
        if (collectionsNavLink) collectionsNavLink.style.display = 'none';
        const continueSection = document.getElementById('continueWatchingSection');
        const recSection = document.getElementById('recommendationsSection');
        if (continueSection) continueSection.style.display = 'none';
        if (recSection) recSection.style.display = 'none';
    }
}

// Show login modal
function showLoginModal() {
    document.getElementById('loginModal').style.display = 'block';
    document.getElementById('loginError').style.display = 'none';
}

// Close login modal
function closeLoginModal() {
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('loginForm').reset();
    document.getElementById('loginError').style.display = 'none';
}

// Show register modal
function showRegisterModal() {
    document.getElementById('registerModal').style.display = 'block';
    document.getElementById('registerError').style.display = 'none';
}

// Close register modal
function closeRegisterModal() {
    document.getElementById('registerModal').style.display = 'none';
    document.getElementById('registerForm').reset();
    document.getElementById('registerError').style.display = 'none';
}

// Handle login
async function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentUser = data.user;
            await updateUIAuthState(true);
            closeLoginModal();
            await loadFavorites();
            displayMedia(); // Refresh to show favorite buttons
        } else {
            errorDiv.textContent = data.error || 'Login failed';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        errorDiv.textContent = 'Network error. Please try again.';
        errorDiv.style.display = 'block';
    }
}

// Handle register
async function handleRegister(event) {
    event.preventDefault();
    const username = document.getElementById('registerUsername').value;
    const displayName = document.getElementById('registerDisplayName').value;
    const password = document.getElementById('registerPassword').value;
    const errorDiv = document.getElementById('registerError');
    
    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ username, password, displayName: displayName || null })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentUser = data.user;
            await updateUIAuthState(true);
            closeRegisterModal();
            await loadFavorites();
            displayMedia(); // Refresh to show favorite buttons
        } else {
            errorDiv.textContent = data.error || 'Registration failed';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        errorDiv.textContent = 'Network error. Please try again.';
        errorDiv.style.display = 'block';
    }
}

// Logout
async function logout() {
    try {
        const response = await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include'
        });
        
        if (response.ok) {
            currentUser = null;
            userFavorites = [];
            await updateUIAuthState(false);
            showingFavorites = false;
            await loadMedia();
        }
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// Toggle user dropdown
function toggleUserDropdown() {
    const dropdown = document.getElementById('userDropdown');
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
}

function closeUserDropdown() {
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
}

// ========== Favorites Functions ==========

// Load user favorites
async function loadFavorites() {
    if (!currentUser) {
        userFavorites = [];
        return;
    }
    
    try {
        const response = await fetch('/api/favorites', {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            userFavorites = Array.isArray(data) ? data : [];
        } else {
            userFavorites = [];
        }
    } catch (error) {
        console.error('Error loading favorites:', error);
        userFavorites = [];
    }
}

// Check if item is favorited
function isFavorited(mediaId) {
    if (!Array.isArray(userFavorites) || !mediaId) return false;
    return userFavorites.some(f => f && f.id === mediaId);
}

// Toggle favorite
async function toggleFavorite(event, mediaId) {
    event.stopPropagation(); // Prevent card click
    
    if (!currentUser) {
        showLoginModal();
        return;
    }
    
    const isFav = isFavorited(mediaId);
    
    try {
        if (isFav) {
            // Remove favorite
            const response = await fetch(`/api/favorites/${mediaId}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            
            if (response.ok) {
                userFavorites = userFavorites.filter(f => f.id !== mediaId);
                updateFavoriteButton(mediaId, false);
            }
        } else {
            // Add favorite - get media data
            const allContent = [...allMedia, ...allAPIContent];
            const media = allContent.find(m => m.id === mediaId);
            
            const response = await fetch('/api/favorites', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    mediaId,
                    title: media?.title,
                    type: media?.type,
                    source: media?.source,
                    posterUrl: media?.posterUrl,
                    year: media?.year
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                userFavorites.push(data.favorite);
                updateFavoriteButton(mediaId, true);
            }
        }
        
        // If showing favorites, refresh the view
        if (showingFavorites) {
            showFavorites();
        }
    } catch (error) {
        console.error('Error toggling favorite:', error);
        alert('Failed to update favorite. Please try again.');
    }
}

// Update favorite button state
function updateFavoriteButton(mediaId, isFavorited) {
    const button = document.querySelector(`[data-favorite-id="${mediaId}"]`);
    if (button) {
        button.classList.toggle('active', isFavorited);
        button.textContent = isFavorited ? '❤️' : '🤍';
    }
}

// Show favorites
async function showFavorites() {
    if (!currentUser) {
        showLoginModal();
        return;
    }
    
    showingFavorites = true;
    
    // Update nav
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    document.getElementById('favoritesNavLink').classList.add('active');
    
    // Update filter tabs
    document.querySelectorAll('.filter-tab').forEach(tab => tab.classList.remove('active'));
    
    // Hide featured section
    document.getElementById('featuredSection').style.display = 'none';
    
    // Get all media and filter to favorites
    const favoriteIds = userFavorites.map(f => f.id);
    const allContent = [...allMedia, ...allAPIContent];
    filteredMedia = allContent.filter(m => favoriteIds.includes(m.id));
    
    // If no favorites, show empty state
    if (filteredMedia.length === 0) {
        document.getElementById('moviesGrid').innerHTML = 
            '<div class="empty-state">No favorites yet. Click the heart icon on any movie or show to add it to your favorites!</div>';
        document.getElementById('pagination').innerHTML = '';
        return;
    }
    
    currentPage = 1;
    displayMedia();
}

// Hide favorites view
function hideFavorites() {
    showingFavorites = false;
    document.getElementById('featuredSection').style.display = 'block';
}
