/**
 * API Settings Module
 * Manages API toggle settings (which APIs are enabled/disabled)
 */

import { state } from './state.js';

export const apiSettings = {
    load() {
        try {
            const saved = localStorage.getItem('apiSettings');
            if (saved) {
                state.apiSettings = { ...state.defaultAPISettings, ...JSON.parse(saved) };
            }
            // Update UI checkboxes
            Object.keys(state.apiSettings).forEach(key => {
                const checkbox = document.getElementById(key);
                if (checkbox) {
                    checkbox.checked = state.apiSettings[key];
                }
            });
        } catch (error) {
            console.warn('Error loading API settings:', error);
            state.apiSettings = { ...state.defaultAPISettings };
        }
    },

    save() {
        try {
            // Get current checkbox states
            Object.keys(state.apiSettings).forEach(key => {
                const checkbox = document.getElementById(key);
                if (checkbox) {
                    state.apiSettings[key] = checkbox.checked;
                }
            });
            localStorage.setItem('apiSettings', JSON.stringify(state.apiSettings));
            console.log('API settings saved:', state.apiSettings);
        } catch (error) {
            console.error('Error saving API settings:', error);
        }
    },

    reset() {
        state.apiSettings = { ...state.defaultAPISettings };
        Object.keys(state.apiSettings).forEach(key => {
            const checkbox = document.getElementById(key);
            if (checkbox) {
                checkbox.checked = state.apiSettings[key];
            }
        });
        this.save();
    },

    show() {
        const modal = document.getElementById('settingsModal');
        if (modal) {
            this.load(); // Load current settings
            modal.style.display = 'block';
            if (window.user && window.user.closeDropdown) {
                window.user.closeDropdown();
            }
        }
    },

    close() {
        const modal = document.getElementById('settingsModal');
        if (modal) {
            modal.style.display = 'none';
            this.save(); // Save when closing
            // Reload media if settings changed
            if (window.media && window.media.load) {
                window.media.load();
            }
        }
    },

    filterContent(content) {
        if (!Array.isArray(content)) return [];
        
        return content.filter(item => {
            if (!item.source) return true; // Keep items without source (local media)
            
            // Check movies
            if (item.type === 'movie' || item.id?.startsWith('tmdb_movie_')) {
                if (item.source === 'tmdb') {
                    return state.apiSettings['api_tmdb_popular'] || state.apiSettings['api_tmdb_trending'] || 
                           state.apiSettings['api_tmdb_toprated'] || state.apiSettings['api_tmdb_nowplaying'] || 
                           state.apiSettings['api_tmdb_upcoming'];
                }
            }
            
            // Check TV shows
            if (item.type === 'tv' || item.id?.startsWith('tmdb_tv_') || item.id?.startsWith('tvmaze_tv_')) {
                if (item.source === 'tmdb') {
                    return state.apiSettings['api_tmdb_tv_popular'] || state.apiSettings['api_tmdb_tv_toprated'];
                }
                if (item.source === 'tvmaze') {
                    return state.apiSettings['api_tvmaze'];
                }
            }
            
            // Check anime
            if (item.type === 'anime' || item.id?.startsWith('anime_') || item.id?.startsWith('jikan_') || item.id?.startsWith('anilist_')) {
                if (item.source === 'jikan') {
                    return state.apiSettings['api_jikan'];
                }
                if (item.source === 'anilist') {
                    return state.apiSettings['api_anilist'];
                }
            }
            
            return true; // Default: keep item if we can't determine
        });
    }
};

// Export to window for inline handlers
window.loadAPISettings = () => apiSettings.load();
window.saveAPISettings = () => apiSettings.save();
window.resetAPISettings = () => apiSettings.reset();
window.showSettings = () => apiSettings.show();
window.closeSettings = () => apiSettings.close();
window.filterAPIContent = (content) => apiSettings.filterContent(content);
