const fs = require('fs-extra');
const path = require('path');

/**
 * Favorites Service
 * Manages user favorites (movies, TV shows, anime)
 */
class FavoritesService {
  constructor() {
    this.dataDir = path.join(__dirname, '../../.data');
    this.favoritesFile = path.join(this.dataDir, 'favorites.json');
    this.initializeStorage();
  }

  /**
   * Initialize storage directory and file
   */
  async initializeStorage() {
    await fs.ensureDir(this.dataDir);
    if (!await fs.pathExists(this.favoritesFile)) {
      await fs.writeJson(this.favoritesFile, {});
    }
  }

  /**
   * Load favorites from file
   */
  async loadFavorites() {
    try {
      const data = await fs.readJson(this.favoritesFile);
      return typeof data === 'object' && data !== null ? data : {};
    } catch (error) {
      console.error('Error loading favorites:', error);
      return {};
    }
  }

  /**
   * Save favorites to file
   */
  async saveFavorites(favorites) {
    try {
      await fs.writeJson(this.favoritesFile, favorites, { spaces: 2 });
    } catch (error) {
      console.error('Error saving favorites:', error);
      throw error;
    }
  }

  /**
   * Get user's favorites
   */
  async getUserFavorites(userId) {
    const favorites = await this.loadFavorites();
    return favorites[userId] || [];
  }

  /**
   * Add item to user's favorites
   */
  async addFavorite(userId, mediaId, mediaData = {}) {
    const favorites = await this.loadFavorites();

    if (!favorites[userId]) {
      favorites[userId] = [];
    }

    // Check if already favorited
    const existingIndex = favorites[userId].findIndex(f => f.id === mediaId);
    if (existingIndex !== -1) {
      return favorites[userId][existingIndex];
    }

    // Add favorite with metadata
    const favoriteItem = {
      id: mediaId,
      addedAt: new Date().toISOString(),
      ...mediaData
    };

    favorites[userId].push(favoriteItem);
    await this.saveFavorites(favorites);

    return favoriteItem;
  }

  /**
   * Remove item from user's favorites
   */
  async removeFavorite(userId, mediaId) {
    const favorites = await this.loadFavorites();

    if (!favorites[userId]) {
      return false;
    }

    const initialLength = favorites[userId].length;
    favorites[userId] = favorites[userId].filter(f => f.id !== mediaId);

    if (favorites[userId].length < initialLength) {
      await this.saveFavorites(favorites);
      return true;
    }

    return false;
  }

  /**
   * Check if item is favorited by user
   */
  async isFavorited(userId, mediaId) {
    const favorites = await this.loadFavorites();
    if (!favorites[userId]) {
      return false;
    }
    return favorites[userId].some(f => f.id === mediaId);
  }

  /**
   * Get favorite count for an item (across all users)
   */
  async getFavoriteCount(mediaId) {
    const favorites = await this.loadFavorites();
    let count = 0;

    for (const userId in favorites) {
      if (favorites[userId].some(f => f.id === mediaId)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Clear all favorites for a user
   */
  async clearUserFavorites(userId) {
    const favorites = await this.loadFavorites();
    delete favorites[userId];
    await this.saveFavorites(favorites);
    return true;
  }
}

module.exports = FavoritesService;
