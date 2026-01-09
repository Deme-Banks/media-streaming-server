/**
 * Favorites Module
 * Handles user favorites management
 */

import { state } from './state.js';

export const favorites = {
    async load() {
        if (!state.currentUser) {
            state.userFavorites = [];
            return;
        }
        
        try {
            const response = await fetch('/api/favorites', {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                state.userFavorites = Array.isArray(data) ? data : [];
            } else {
                state.userFavorites = [];
            }
        } catch (error) {
            console.error('Error loading favorites:', error);
            state.userFavorites = [];
        }
    },

    isFavorited(mediaId) {
        if (!Array.isArray(state.userFavorites) || !mediaId) return false;
        return state.userFavorites.some(f => f && f.id === mediaId);
    },

    async toggle(event, mediaId) {
        event.stopPropagation();
        
        if (!state.currentUser) {
            if (window.auth && window.auth.showLoginModal) {
                window.auth.showLoginModal();
            }
            return;
        }
        
        const isFav = this.isFavorited(mediaId);
        
        try {
            if (isFav) {
                const response = await fetch(`/api/favorites/${mediaId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                
                if (response.ok) {
                    state.userFavorites = state.userFavorites.filter(f => f.id !== mediaId);
                    this.updateButton(mediaId, false);
                }
            } else {
                const allContent = [...state.allMedia, ...state.allAPIContent];
                const media = allContent.find(m => m.id === mediaId);
                
                const response = await fetch('/api/favorites', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
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
                    state.userFavorites.push(data.favorite);
                    this.updateButton(mediaId, true);
                }
            }
            
            if (state.showingFavorites) {
                this.show();
            }
        } catch (error) {
            console.error('Error toggling favorite:', error);
            alert('Failed to update favorite. Please try again.');
        }
    },

    updateButton(mediaId, isFavorited) {
        const button = document.querySelector(`[data-favorite-id="${mediaId}"]`);
        if (button) {
            button.classList.toggle('active', isFavorited);
            button.textContent = isFavorited ? '❤️' : '🤍';
        }
    },

    async show() {
        if (!state.currentUser) {
            if (window.auth && window.auth.showLoginModal) {
                window.auth.showLoginModal();
            }
            return;
        }
        
        state.showingFavorites = true;
        
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        const favLink = document.getElementById('favoritesNavLink');
        if (favLink) favLink.classList.add('active');
        
        document.querySelectorAll('.filter-tab').forEach(tab => tab.classList.remove('active'));
        
        const featuredSection = document.getElementById('featuredSection');
        if (featuredSection) featuredSection.style.display = 'none';
        
        const favoriteIds = state.userFavorites.map(f => f.id);
        const allContent = [...state.allMedia, ...state.allAPIContent];
        state.filteredMedia = allContent.filter(m => favoriteIds.includes(m.id));
        
        const moviesGrid = document.getElementById('moviesGrid');
        if (state.filteredMedia.length === 0) {
            if (moviesGrid) {
                moviesGrid.innerHTML = '<div class="empty-state">No favorites yet. Click the heart icon on any movie or show to add it to your favorites!</div>';
            }
            const pagination = document.getElementById('pagination');
            if (pagination) pagination.innerHTML = '';
            return;
        }
        
        state.currentPage = 1;
        if (window.media && window.media.display) {
            window.media.display();
        }
    },

    hide() {
        state.showingFavorites = false;
        const featuredSection = document.getElementById('featuredSection');
        if (featuredSection) featuredSection.style.display = 'block';
    }
};

// Export to window
window.loadFavorites = () => favorites.load();
window.isFavorited = (id) => favorites.isFavorited(id);
window.toggleFavorite = (e, id) => favorites.toggle(e, id);
window.updateFavoriteButton = (id, isFav) => favorites.updateButton(id, isFav);
window.showFavorites = () => favorites.show();
window.hideFavorites = () => favorites.hide();
window.favorites = favorites;
