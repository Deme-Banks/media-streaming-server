const fs = require('fs-extra');
const path = require('path');

/**
 * Watch History Service
 * Tracks what users have watched and resume positions
 */
class WatchHistoryService {
  constructor() {
    this.historyDir = path.join(__dirname, '../../.data');
    this.initializeStorage();
  }

  async initializeStorage() {
    await fs.ensureDir(this.historyDir);
  }

  /**
   * Get watch history file path for a user
   */
  getHistoryFile(userId) {
    return path.join(this.historyDir, `watchHistory_${userId}.json`);
  }

  /**
   * Get watch history for a user
   */
  async getHistory(userId) {
    try {
      const historyFile = this.getHistoryFile(userId);
      if (await fs.pathExists(historyFile)) {
        const data = await fs.readJson(historyFile);
        return Array.isArray(data) ? data : [];
      }
      return [];
    } catch (error) {
      console.error('Error loading watch history:', error);
      return [];
    }
  }

  /**
   * Save watch history for a user
   */
  async saveHistory(userId, history) {
    try {
      const historyFile = this.getHistoryFile(userId);
      await fs.writeJson(historyFile, history, { spaces: 2 });
    } catch (error) {
      console.error('Error saving watch history:', error);
      throw error;
    }
  }

  /**
   * Add or update watch history entry
   */
  async addHistory(userId, mediaId, mediaType, position = 0, duration = 0) {
    try {
      const history = await this.getHistory(userId);
      const existingIndex = history.findIndex(h => h.mediaId === mediaId);
      
      const entry = {
        mediaId,
        mediaType,
        position, // Current playback position in seconds
        duration, // Total duration in seconds
        lastWatched: new Date().toISOString(),
        progress: duration > 0 ? (position / duration) * 100 : 0
      };

      if (existingIndex >= 0) {
        history[existingIndex] = entry;
      } else {
        history.push(entry);
      }

      // Sort by last watched (newest first)
      history.sort((a, b) => new Date(b.lastWatched) - new Date(a.lastWatched));
      
      // Keep only last 100 entries
      if (history.length > 100) {
        history.splice(100);
      }

      await this.saveHistory(userId, history);
      return entry;
    } catch (error) {
      console.error('Error adding watch history:', error);
      throw error;
    }
  }

  /**
   * Get resume position for a media item
   */
  async getResumePosition(userId, mediaId) {
    try {
      const history = await this.getHistory(userId);
      const entry = history.find(h => h.mediaId === mediaId);
      return entry ? {
        position: entry.position,
        duration: entry.duration,
        progress: entry.progress
      } : null;
    } catch (error) {
      console.error('Error getting resume position:', error);
      return null;
    }
  }

  /**
   * Get continue watching list (items with progress > 5% and < 90%)
   */
  async getContinueWatching(userId, limit = 10) {
    try {
      const history = await this.getHistory(userId);
      return history
        .filter(h => h.progress > 5 && h.progress < 90)
        .slice(0, limit);
    } catch (error) {
      console.error('Error getting continue watching:', error);
      return [];
    }
  }

  /**
   * Remove from history
   */
  async removeHistory(userId, mediaId) {
    try {
      const history = await this.getHistory(userId);
      const filtered = history.filter(h => h.mediaId !== mediaId);
      await this.saveHistory(userId, filtered);
    } catch (error) {
      console.error('Error removing watch history:', error);
      throw error;
    }
  }
}

module.exports = new WatchHistoryService();
