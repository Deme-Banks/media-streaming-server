const fs = require('fs-extra');
const path = require('path');

/**
 * Recommendations Service
 * Provides content recommendations based on user preferences
 */
class RecommendationsService {
  constructor() {
    this.historyDir = path.join(__dirname, '../../.data');
    this.initializeStorage();
  }

  async initializeStorage() {
    await fs.ensureDir(this.historyDir);
  }

  /**
   * Get recommendations based on favorites
   */
  async getRecommendationsFromFavorites(userId, favorites, allMedia) {
    try {
      // Get genres from favorites
      const favoriteGenres = new Set();
      favorites.forEach(fav => {
        if (fav.genres && Array.isArray(fav.genres)) {
          fav.genres.forEach(genre => favoriteGenres.add(genre.toLowerCase()));
        }
      });

      // Find similar content
      const recommendations = allMedia.filter(media => {
        // Don't recommend items already favorited
        if (favorites.find(f => f.mediaId === media.id)) return false;
        
        // Match by genres
        if (media.genres && Array.isArray(media.genres)) {
          return media.genres.some(genre => 
            favoriteGenres.has(genre.toLowerCase())
          );
        }
        return false;
      });

      // Sort by rating and limit
      return recommendations
        .sort((a, b) => (b.rating || 0) - (a.rating || 0))
        .slice(0, 20);
    } catch (error) {
      console.error('Error getting recommendations:', error);
      return [];
    }
  }

  /**
   * Get recommendations based on watch history
   */
  async getRecommendationsFromHistory(userId, history, allMedia) {
    try {
      // Get genres from watched content
      const watchedGenres = new Set();
      history.forEach(entry => {
        const media = allMedia.find(m => m.id === entry.mediaId);
        if (media && media.genres && Array.isArray(media.genres)) {
          media.genres.forEach(genre => watchedGenres.add(genre.toLowerCase()));
        }
      });

      // Find similar content
      const recommendations = allMedia.filter(media => {
        // Don't recommend items already watched
        if (history.find(h => h.mediaId === media.id)) return false;
        
        // Match by genres
        if (media.genres && Array.isArray(media.genres)) {
          return media.genres.some(genre => 
            watchedGenres.has(genre.toLowerCase())
          );
        }
        return false;
      });

      // Sort by rating and limit
      return recommendations
        .sort((a, b) => (b.rating || 0) - (a.rating || 0))
        .slice(0, 20);
    } catch (error) {
      console.error('Error getting recommendations from history:', error);
      return [];
    }
  }

  /**
   * Get "Similar to" recommendations for a specific media item
   */
  getSimilarTo(media, allMedia, limit = 10) {
    if (!media || !media.genres || !Array.isArray(media.genres)) {
      return [];
    }

    const mediaGenres = new Set(media.genres.map(g => g.toLowerCase()));
    
    const similar = allMedia
      .filter(m => {
        // Don't include the same item
        if (m.id === media.id) return false;
        
        // Match by genres
        if (m.genres && Array.isArray(m.genres)) {
          return m.genres.some(genre => 
            mediaGenres.has(genre.toLowerCase())
          );
        }
        return false;
      })
      .sort((a, b) => {
        // Sort by genre match count and rating
        const aMatchCount = a.genres ? a.genres.filter(g => mediaGenres.has(g.toLowerCase())).length : 0;
        const bMatchCount = b.genres ? b.genres.filter(g => mediaGenres.has(g.toLowerCase())).length : 0;
        
        if (aMatchCount !== bMatchCount) {
          return bMatchCount - aMatchCount;
        }
        return (b.rating || 0) - (a.rating || 0);
      })
      .slice(0, limit);

    return similar;
  }
}

module.exports = new RecommendationsService();
