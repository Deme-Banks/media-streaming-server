/**
 * Authentication Module
 * Handles user login, registration, logout, and authentication state
 */

import { state } from './state.js';

export const auth = {
    async check() {
        try {
            const response = await fetch('/api/auth/me', {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                state.currentUser = data.user || data;
                await this.updateUIState(true);
                if (window.favorites && window.favorites.load) {
                    await window.favorites.load();
                }
                return true;
            } else {
                state.currentUser = null;
                await this.updateUIState(false);
                return false;
            }
        } catch (error) {
            console.error('Auth check error:', error);
            state.currentUser = null;
            await this.updateUIState(false);
            return false;
        }
    },

    async updateUIState(isAuthenticated) {
        const authButtons = document.getElementById('authButtons');
        const userMenu = document.getElementById('userMenu');
        const favoritesNavLink = document.getElementById('favoritesNavLink');
        const collectionsNavLink = document.getElementById('collectionsNavLink');
        
        if (isAuthenticated && state.currentUser) {
            if (authButtons) authButtons.style.display = 'none';
            if (userMenu) userMenu.style.display = 'block';
            if (favoritesNavLink) favoritesNavLink.style.display = 'inline-block';
            if (collectionsNavLink) collectionsNavLink.style.display = 'inline-block';
            const displayName = document.getElementById('userDisplayName');
            if (displayName) {
                displayName.textContent = state.currentUser.displayName || state.currentUser.username;
            }
            if (window.collections && window.collections.load) {
                await window.collections.load();
            }
            if (window.watchHistory && window.watchHistory.loadContinueWatching) {
                await window.watchHistory.loadContinueWatching();
            }
            if (window.recommendations && window.recommendations.load) {
                await window.recommendations.load();
            }
        } else {
            if (authButtons) authButtons.style.display = 'flex';
            if (userMenu) userMenu.style.display = 'none';
            if (favoritesNavLink) favoritesNavLink.style.display = 'none';
            if (collectionsNavLink) collectionsNavLink.style.display = 'none';
            const continueSection = document.getElementById('continueWatchingSection');
            const recSection = document.getElementById('recommendationsSection');
            if (continueSection) continueSection.style.display = 'none';
            if (recSection) recSection.style.display = 'none';
        }
    },

    showLoginModal() {
        const modal = document.getElementById('loginModal');
        const error = document.getElementById('loginError');
        if (modal) modal.style.display = 'block';
        if (error) error.style.display = 'none';
    },

    closeLoginModal() {
        const modal = document.getElementById('loginModal');
        const form = document.getElementById('loginForm');
        const error = document.getElementById('loginError');
        if (modal) modal.style.display = 'none';
        if (form) form.reset();
        if (error) error.style.display = 'none';
    },

    showRegisterModal() {
        const modal = document.getElementById('registerModal');
        const error = document.getElementById('registerError');
        if (modal) modal.style.display = 'block';
        if (error) error.style.display = 'none';
    },

    closeRegisterModal() {
        const modal = document.getElementById('registerModal');
        const form = document.getElementById('registerForm');
        const error = document.getElementById('registerError');
        if (modal) modal.style.display = 'none';
        if (form) form.reset();
        if (error) error.style.display = 'none';
    },

    async handleLogin(event) {
        event.preventDefault();
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        const errorDiv = document.getElementById('loginError');
        
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                state.currentUser = data.user;
                await this.updateUIState(true);
                this.closeLoginModal();
                if (window.favorites && window.favorites.load) {
                    await window.favorites.load();
                }
                if (window.media && window.media.display) {
                    window.media.display();
                }
            } else {
                if (errorDiv) {
                    errorDiv.textContent = data.error || 'Login failed';
                    errorDiv.style.display = 'block';
                }
            }
        } catch (error) {
            if (errorDiv) {
                errorDiv.textContent = 'Network error. Please try again.';
                errorDiv.style.display = 'block';
            }
        }
    },

    async handleRegister(event) {
        event.preventDefault();
        const username = document.getElementById('registerUsername').value;
        const displayName = document.getElementById('registerDisplayName').value;
        const password = document.getElementById('registerPassword').value;
        const errorDiv = document.getElementById('registerError');
        
        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ username, password, displayName: displayName || null })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                state.currentUser = data.user;
                await this.updateUIState(true);
                this.closeRegisterModal();
                if (window.favorites && window.favorites.load) {
                    await window.favorites.load();
                }
                if (window.media && window.media.display) {
                    window.media.display();
                }
            } else {
                if (errorDiv) {
                    errorDiv.textContent = data.error || 'Registration failed';
                    errorDiv.style.display = 'block';
                }
            }
        } catch (error) {
            if (errorDiv) {
                errorDiv.textContent = 'Network error. Please try again.';
                errorDiv.style.display = 'block';
            }
        }
    },

    async logout() {
        try {
            const response = await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include'
            });
            
            if (response.ok) {
                state.currentUser = null;
                state.userFavorites = [];
                await this.updateUIState(false);
                state.showingFavorites = false;
                if (window.media && window.media.load) {
                    await window.media.load();
                }
            }
        } catch (error) {
            console.error('Logout error:', error);
        }
    },

    toggleUserDropdown() {
        const dropdown = document.getElementById('userDropdown');
        if (dropdown) {
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        }
    },

    closeUserDropdown() {
        const dropdown = document.getElementById('userDropdown');
        if (dropdown) {
            dropdown.style.display = 'none';
        }
    }
};

// Export to window for inline handlers
window.checkAuth = () => auth.check();
window.updateUIAuthState = (isAuth) => auth.updateUIState(isAuth);
window.showLoginModal = () => auth.showLoginModal();
window.closeLoginModal = () => auth.closeLoginModal();
window.showRegisterModal = () => auth.showRegisterModal();
window.closeRegisterModal = () => auth.closeRegisterModal();
window.handleLogin = (e) => auth.handleLogin(e);
window.handleRegister = (e) => auth.handleRegister(e);
window.logout = () => auth.logout();
window.toggleUserDropdown = () => auth.toggleUserDropdown();
window.closeUserDropdown = () => auth.closeUserDropdown();
