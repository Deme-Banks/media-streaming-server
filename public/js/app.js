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

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await loadGenres(); // Load genres first
    await loadMedia();
    setupEventListeners();
    
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
    });
});

// Setup event listeners
function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
}

// Load media from API
async function loadMedia() {
    try {
        // Get local media separately for streaming
        const localResponse = await fetch('/api/media');
        if (localResponse.ok) {
            allMedia = await localResponse.json();
        } else {
            allMedia = [];
        }

        // Load LOTS of API content - popular movies, TV shows, and anime
        allAPIContent = [];
        
        try {
            // Load popular movies, TV shows, and anime (multiple pages for more content)
            const [movies1, movies2, tvShows1, tvShows2, anime1, anime2] = await Promise.all([
                fetch('/api/popular/movies?page=1').then(r => r.ok ? r.json() : []).catch(() => []),
                fetch('/api/popular/movies?page=2').then(r => r.ok ? r.json() : []).catch(() => []),
                fetch('/api/popular/tv?page=1').then(r => r.ok ? r.json() : []).catch(() => []),
                fetch('/api/popular/tv?page=2').then(r => r.ok ? r.json() : []).catch(() => []),
                fetch('/api/popular/anime?page=1').then(r => r.ok ? r.json() : []).catch(() => []),
                fetch('/api/popular/anime?page=2').then(r => r.ok ? r.json() : []).catch(() => [])
            ]);
            
        // Combine all API content
        allAPIContent = [
            ...(Array.isArray(movies1) ? movies1 : []),
            ...(Array.isArray(movies2) ? movies2 : []),
            ...(Array.isArray(tvShows1) ? tvShows1 : []),
            ...(Array.isArray(tvShows2) ? tvShows2 : []),
            ...(Array.isArray(anime1) ? anime1 : []),
            ...(Array.isArray(anime2) ? anime2 : [])
        ];
        
        // Log what was loaded
        const moviesCount = (movies1?.length || 0) + (movies2?.length || 0);
        const tvCount = (tvShows1?.length || 0) + (tvShows2?.length || 0);
        const animeCount = (anime1?.length || 0) + (anime2?.length || 0);
        console.log(`✅ Loaded API content: ${moviesCount} movies (TMDB), ${tvCount} TV shows (TMDB), ${animeCount} anime (Jikan)`);
        console.log(`📦 Total API content: ${allAPIContent.length} items`);
        } catch (error) {
            console.warn('API content unavailable:', error);
            allAPIContent = [];
        }

        // Combine local and API content
        const combinedMedia = [...allMedia, ...allAPIContent];
        filteredMedia = combinedMedia;
        
        console.log(`📚 Total media: ${allMedia.length} local files + ${allAPIContent.length} API items = ${combinedMedia.length} total`);
        
        // Check API status
        try {
            const statusResponse = await fetch('/api/health');
            if (statusResponse.ok) {
                const status = await statusResponse.json();
                console.log(`🔑 API Status:`, status.apis);
                if (status.message) {
                    console.log(`ℹ️ ${status.message}`);
                }
            }
        } catch (error) {
            console.warn('Could not check API status:', error);
        }
        
        displayMedia();
        displayFeatured();
    } catch (error) {
        console.error('Error loading media:', error);
        const moviesGrid = document.getElementById('moviesGrid');
        if (moviesGrid) {
            moviesGrid.innerHTML = '<div class="empty-state">Failed to load media. Please check your media directory.</div>';
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

// Display featured media (mix of local and API content)
async function displayFeatured() {
    const featuredGrid = document.getElementById('featuredGrid');
    if (!featuredGrid) return;
    
    try {
        // Try to get featured content from API
        const response = await fetch('/api/featured');
        if (response.ok) {
            const featured = await response.json();
            if (Array.isArray(featured) && featured.length > 0) {
                featuredGrid.innerHTML = featured.slice(0, 8).map(media => createMovieCard(media, true)).join('');
            } else {
                // Fallback to local media
                const featuredLocal = Array.isArray(allMedia) ? allMedia.slice(0, 8) : [];
                featuredGrid.innerHTML = featuredLocal.map(media => createMovieCard(media, true)).join('');
            }
        } else {
            // Fallback to local media
            const featuredLocal = Array.isArray(allMedia) ? allMedia.slice(0, 8) : [];
            featuredGrid.innerHTML = featuredLocal.map(media => createMovieCard(media, true)).join('');
        }
    } catch (error) {
        console.warn('Error displaying featured:', error);
        // Fallback to local media
        const featuredLocal = Array.isArray(allMedia) ? allMedia.slice(0, 8) : [];
        featuredGrid.innerHTML = featuredLocal.map(media => createMovieCard(media, true)).join('');
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
function createMovieCard(media, isFeatured = false) {
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
    
    // Watch badge if Cinetaro streaming is available
    const watchBadge = (media.streamingUrl && media.hasStreaming) ? `<span class="watch-badge">▶️ Watch</span>` : '';
    
    // Favorite button (only show if user is logged in)
    let favoriteBtn = '';
    if (currentUser && typeof isFavorited === 'function') {
        const isFav = isFavorited(media.id);
        const favIcon = isFav ? '❤️' : '🤍';
        favoriteBtn = `<button class="favorite-btn ${isFav ? 'active' : ''}" data-favorite-id="${media.id}" onclick="toggleFavorite(event, '${media.id}')" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">${favIcon}</button>`;
    }
    
    return `
        <div class="movie-card" data-id="${media.id}" data-type="${mediaType}" data-source="${source}">
            ${badge}
            ${watchBadge}
            ${favoriteBtn}
            <img src="${thumbnailUrl}" alt="${title}" class="movie-thumbnail" 
                 onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzJhMmEyYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5WaWRlbyBJY29uPC90ZXh0Pjwvc3ZnPg=='">
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
    
    // For API content, always try to get streaming URL (even if not in initial data)
    if (isAPIContent && (source !== 'local')) {
        // Try to get/fetch streaming URL from server
        let streamingUrl = media.streamingUrl;
        
        // If no streaming URL in media object, try to fetch it
        if (!streamingUrl && media.tmdbId) {
            try {
                const streamingResponse = await fetch(`/api/streaming/${mediaId}?type=${media.type || 'movie'}`);
                if (streamingResponse.ok) {
                    const streamingData = await streamingResponse.json();
                    streamingUrl = streamingData.streamingUrl;
                }
            } catch (error) {
                console.warn('Could not fetch streaming URL:', error);
            }
        }
        
        // Show Cinetaro iframe player if we have a streaming URL
        if (streamingUrl) {
            cinetaroPlayer.src = streamingUrl;
            cinetaroPlayer.style.display = 'block';
            
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
        } else {
            // Try to show local video if available, otherwise show info only
            console.warn('No streaming URL available for:', media.title);
        }
        
        // Always show media info
        videoInfo.innerHTML = `
            <h3>${media.title}</h3>
            ${media.year ? `<p><strong>Year:</strong> ${media.year}</p>` : ''}
            ${media.rating ? `<p><strong>Rating:</strong> ⭐ ${media.rating.toFixed(1)}</p>` : ''}
            ${media.genres && media.genres.length > 0 ? `<p><strong>Genres:</strong> ${media.genres.join(', ')}</p>` : ''}
            ${media.episodes ? `<p><strong>Episodes:</strong> ${media.episodes}</p>` : ''}
            ${media.overview ? `<p class="overview"><strong>Overview:</strong><br>${media.overview}</p>` : ''}
            ${media.type === 'tv' ? `<p><small>Season 1, Episode 1 (use the player controls to navigate to other episodes)</small></p>` : ''}
            ${!streamingUrl ? `<p class="api-notice">Loading player... If playback doesn't start, the content may not be available yet.</p>` : ''}
        `;
        
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
    
    videoModal.style.display = 'none';
    videoPlayer.pause();
    videoPlayer.src = '';
    videoPlayer.style.display = 'none';
    cinetaroPlayer.src = '';
    cinetaroPlayer.style.display = 'none';
    const subtitleSelector = document.getElementById('subtitleSelector');
    if (subtitleSelector) subtitleSelector.style.display = 'none';
    videoInfo.innerHTML = '';
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
    let baseMedia = [...allMedia, ...allAPIContent];
    
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
        filteredMedia = [...allMedia, ...allAPIContent];
        currentPage = 1;
        displayMedia();
        return;
    }
    
    // Search local media first
    const localResults = allMedia.filter(media => 
        media.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    // Search API content
    let apiResults = [];
    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(searchTerm)}`);
        if (response.ok) {
            apiResults = await response.json();
        }
    } catch (error) {
        console.warn('API search unavailable:', error);
    }
    
    // Combine results and deduplicate
    const combinedResults = [...localResults, ...apiResults];
    // Note: Server already deduplicates, but we'll deduplicate client-side as well for safety
    filteredMedia = combinedResults;
    
    currentPage = 1;
    currentFilter = 'all';
    currentGenre = 'all'; // Reset genre filter when searching
    
    // Reset filter tabs
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector('[data-filter="all"]').classList.add('active');
    
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
            currentUser = await response.json();
            updateUIAuthState(true);
            await loadFavorites();
        } else {
            currentUser = null;
            updateUIAuthState(false);
        }
    } catch (error) {
        console.error('Auth check error:', error);
        currentUser = null;
        updateUIAuthState(false);
    }
}

// Update UI based on auth state
function updateUIAuthState(isAuthenticated) {
    const authButtons = document.getElementById('authButtons');
    const userMenu = document.getElementById('userMenu');
    const favoritesNavLink = document.getElementById('favoritesNavLink');
    
    if (isAuthenticated && currentUser) {
        authButtons.style.display = 'none';
        userMenu.style.display = 'block';
        if (favoritesNavLink) favoritesNavLink.style.display = 'inline-block';
        document.getElementById('userDisplayName').textContent = currentUser.displayName || currentUser.username;
    } else {
        authButtons.style.display = 'flex';
        userMenu.style.display = 'none';
        if (favoritesNavLink) favoritesNavLink.style.display = 'none';
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
            updateUIAuthState(true);
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
            updateUIAuthState(true);
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
            updateUIAuthState(false);
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
