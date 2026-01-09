/**
 * Search Module
 * Handles search functionality with suggestions and filters
 */

import { state } from './state.js';
import { apiSettings } from './apiSettings.js';

export const search = {
    async handleInput() {
        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('clearSearchBtn');
        const searchTerm = searchInput ? searchInput.value.trim() : '';
        state.currentSearchTerm = searchTerm;
        
        if (clearBtn) {
            clearBtn.style.display = searchTerm ? 'block' : 'none';
        }
        
        const searchFiltersEl = document.getElementById('searchFilters');
        if (searchFiltersEl) {
            searchFiltersEl.style.display = searchTerm ? 'flex' : 'none';
        }
        
        clearTimeout(state.searchSuggestionsTimeout);
        if (searchTerm.length >= 2) {
            state.searchSuggestionsTimeout = setTimeout(() => {
                this.showSuggestions();
            }, 300);
        } else {
            this.hideSuggestions();
        }
    },

    async showSuggestions() {
        const searchInput = document.getElementById('searchInput');
        const searchTerm = searchInput ? searchInput.value.trim() : '';
        
        if (searchTerm.length < 2) {
            this.hideSuggestions();
            return;
        }
        
        const suggestionsDiv = document.getElementById('searchSuggestions');
        const suggestionsList = document.getElementById('searchSuggestionsList');
        
        if (!suggestionsDiv || !suggestionsList) return;
        
        try {
            suggestionsList.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">Searching...</div>';
            suggestionsDiv.style.display = 'block';
            
            const results = await this.search(searchTerm, true);
            
            if (results.length > 0) {
                const topResults = results.slice(0, 8);
                suggestionsList.innerHTML = topResults.map(media => {
                    const thumbnail = media.posterUrl || media.backdropUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzJhMmEyYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5Qb3N0ZXI8L3RleHQ+PC9zdmc+';
                    const typeLabel = media.type === 'movie' ? 'Movie' : media.type === 'tv' ? 'TV' : media.type === 'anime' ? 'Anime' : 'Media';
                    const year = media.year || (media.releaseDate ? media.releaseDate.split('-')[0] : '');
                    const rating = media.rating ? `⭐ ${media.rating.toFixed(1)}` : '';
                    
                    return `
                        <div class="search-suggestion-item" onclick="window.search.selectSuggestion('${media.id}', '${media.type || 'video'}', '${media.source || 'local'}')">
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
    },

    hideSuggestions() {
        const suggestionsDiv = document.getElementById('searchSuggestions');
        if (suggestionsDiv) {
            suggestionsDiv.style.display = 'none';
        }
        if (state.searchSuggestionsTimeout) {
            clearTimeout(state.searchSuggestionsTimeout);
        }
    },

    hideSuggestionsDelayed() {
        setTimeout(() => this.hideSuggestions(), 200);
    },

    selectSuggestion(mediaId, mediaType, source) {
        this.hideSuggestions();
        if (window.player && window.player.open) {
            window.player.open(mediaId, mediaType, source);
        }
    },

    clear() {
        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('clearSearchBtn');
        const searchFiltersEl = document.getElementById('searchFilters');
        const resultsCount = document.getElementById('resultsCount');
        const featuredSection = document.getElementById('featuredSection');
        
        if (searchInput) searchInput.value = '';
        if (clearBtn) clearBtn.style.display = 'none';
        if (searchFiltersEl) searchFiltersEl.style.display = 'none';
        if (resultsCount) resultsCount.style.display = 'none';
        if (featuredSection) featuredSection.style.display = 'block';
        
        this.hideSuggestions();
        
        state.showingFavorites = false;
        state.currentFilter = 'all';
        state.currentPage = 1;
        state.filteredMedia = [...state.allMedia, ...state.allAPIContent.filter(item => {
            if (state.nonStreamableItems.has(item.id)) return false;
            if (!item.source || item.source === 'local') return true;
            return item.hasStreaming === true || !!item.streamingUrl;
        })];
        
        if (window.media && window.media.display) {
            window.media.display();
        }
        if (window.media && window.media.displayFeatured) {
            window.media.displayFeatured();
        }
    },

    updateFilters() {
        state.searchFilters.movies = document.getElementById('filterMovies')?.checked ?? true;
        state.searchFilters.tv = document.getElementById('filterTV')?.checked ?? true;
        state.searchFilters.anime = document.getElementById('filterAnime')?.checked ?? true;
    },

    loadHistory() {
        try {
            const saved = localStorage.getItem('searchHistory');
            if (saved) {
                state.searchHistory = JSON.parse(saved);
            }
        } catch (error) {
            console.warn('Error loading search history:', error);
            state.searchHistory = [];
        }
    },

    saveHistory(term) {
        if (!term || term.length < 2) return;
        state.searchHistory = state.searchHistory.filter(t => t.toLowerCase() !== term.toLowerCase());
        state.searchHistory.unshift(term);
        state.searchHistory = state.searchHistory.slice(0, 10);
        try {
            localStorage.setItem('searchHistory', JSON.stringify(state.searchHistory));
        } catch (error) {
            console.warn('Error saving search history:', error);
        }
    },

    async search(query, quick = false) {
        if (!query || query.length < 2) return [];
        
        try {
            const searchParams = new URLSearchParams({
                q: query,
                movies: state.searchFilters.movies ? '1' : '0',
                tv: state.searchFilters.tv ? '1' : '0',
                anime: state.searchFilters.anime ? '1' : '0',
                limit: quick ? '8' : '50'
            });
            
            const response = await fetch(`/api/search?${searchParams}`);
            if (response.ok) {
                const results = await response.json();
                return results.filter(item => {
                    if (state.nonStreamableItems.has(item.id)) return false;
                    if (!item.source || item.source === 'local') return true;
                    return item.hasStreaming === true || !!item.streamingUrl;
                });
            }
        } catch (error) {
            console.error('Search error:', error);
        }
        
        return [];
    },

    async perform() {
        const searchInput = document.getElementById('searchInput');
        const searchTerm = searchInput ? searchInput.value.trim() : '';
        const resultsCount = document.getElementById('resultsCount');
        const featuredSection = document.getElementById('featuredSection');
        
        if (!searchTerm) {
            state.filteredMedia = [...state.allMedia, ...state.allAPIContent];
            state.currentPage = 1;
            if (window.media && window.media.display) {
                window.media.display();
            }
            if (resultsCount) resultsCount.style.display = 'none';
            if (featuredSection) featuredSection.style.display = 'block';
            return;
        }
        
        if (featuredSection) featuredSection.style.display = 'none';
        if (resultsCount) {
            resultsCount.style.display = 'block';
            resultsCount.textContent = 'Searching...';
        }
        
        const localResults = state.allMedia.filter(media =>
            media.title.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        let apiResults = [];
        try {
            apiResults = await this.search(searchTerm, false);
        } catch (error) {
            console.warn('API search unavailable:', error);
        }
        
        state.filteredMedia = [...localResults, ...apiResults];
        state.currentPage = 1;
        state.currentFilter = 'all';
        state.currentGenre = 'all';
        
        document.querySelectorAll('.filter-tab').forEach(tab => tab.classList.remove('active'));
        const allTab = document.querySelector('[data-filter="all"]');
        if (allTab) allTab.classList.add('active');
        
        if (window.media && window.media.display) {
            window.media.display();
        }
        if (resultsCount) {
            resultsCount.textContent = `${state.filteredMedia.length} results for "${searchTerm}"`;
        }
        this.saveHistory(searchTerm);
    }
};

// Export to window
window.handleSearchInput = () => search.handleInput();
window.showSearchSuggestions = () => search.showSuggestions();
window.hideSearchSuggestions = () => search.hideSuggestions();
window.hideSearchSuggestionsDelayed = () => search.hideSuggestionsDelayed();
window.selectSearchSuggestion = (id, type, source) => search.selectSuggestion(id, type, source);
window.clearSearch = () => search.clear();
window.updateSearchFilters = () => search.updateFilters();
window.loadSearchHistory = () => search.loadHistory();
window.performSearch = () => search.perform();
window.search = search;
