const fs = require('fs-extra');
const path = require('path');

/**
 * Collections Service
 * Manages user-created collections/playlists
 */
class CollectionsService {
  constructor() {
    this.collectionsDir = path.join(__dirname, '../../.data');
    this.initializeStorage();
  }

  async initializeStorage() {
    await fs.ensureDir(this.collectionsDir);
  }

  /**
   * Get collections file path for a user
   */
  getCollectionsFile(userId) {
    return path.join(this.collectionsDir, `collections_${userId}.json`);
  }

  /**
   * Get all collections for a user
   */
  async getCollections(userId) {
    try {
      const collectionsFile = this.getCollectionsFile(userId);
      if (await fs.pathExists(collectionsFile)) {
        const data = await fs.readJson(collectionsFile);
        return Array.isArray(data) ? data : [];
      }
      return [];
    } catch (error) {
      console.error('Error loading collections:', error);
      return [];
    }
  }

  /**
   * Save collections for a user
   */
  async saveCollections(userId, collections) {
    try {
      const collectionsFile = this.getCollectionsFile(userId);
      await fs.writeJson(collectionsFile, collections, { spaces: 2 });
    } catch (error) {
      console.error('Error saving collections:', error);
      throw error;
    }
  }

  /**
   * Create a new collection
   */
  async createCollection(userId, name, description = '') {
    try {
      const collections = await this.getCollections(userId);
      const newCollection = {
        id: `collection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        description,
        mediaIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      collections.push(newCollection);
      await this.saveCollections(userId, collections);
      return newCollection;
    } catch (error) {
      console.error('Error creating collection:', error);
      throw error;
    }
  }

  /**
   * Add media to a collection
   */
  async addToCollection(userId, collectionId, mediaId, mediaData = {}) {
    try {
      const collections = await this.getCollections(userId);
      const collection = collections.find(c => c.id === collectionId);
      if (!collection) {
        throw new Error('Collection not found');
      }
      
      if (!collection.mediaIds.find(id => id === mediaId)) {
        collection.mediaIds.push(mediaId);
        collection.updatedAt = new Date().toISOString();
        await this.saveCollections(userId, collections);
      }
      
      return collection;
    } catch (error) {
      console.error('Error adding to collection:', error);
      throw error;
    }
  }

  /**
   * Remove media from a collection
   */
  async removeFromCollection(userId, collectionId, mediaId) {
    try {
      const collections = await this.getCollections(userId);
      const collection = collections.find(c => c.id === collectionId);
      if (!collection) {
        throw new Error('Collection not found');
      }
      
      collection.mediaIds = collection.mediaIds.filter(id => id !== mediaId);
      collection.updatedAt = new Date().toISOString();
      await this.saveCollections(userId, collections);
      
      return collection;
    } catch (error) {
      console.error('Error removing from collection:', error);
      throw error;
    }
  }

  /**
   * Delete a collection
   */
  async deleteCollection(userId, collectionId) {
    try {
      const collections = await this.getCollections(userId);
      const filtered = collections.filter(c => c.id !== collectionId);
      await this.saveCollections(userId, filtered);
      return true;
    } catch (error) {
      console.error('Error deleting collection:', error);
      throw error;
    }
  }

  /**
   * Get media in a collection
   */
  async getCollectionMedia(userId, collectionId, allMedia) {
    try {
      const collections = await this.getCollections(userId);
      const collection = collections.find(c => c.id === collectionId);
      if (!collection) {
        return [];
      }
      
      return collection.mediaIds
        .map(id => allMedia.find(m => m.id === id))
        .filter(m => m); // Remove undefined
    } catch (error) {
      console.error('Error getting collection media:', error);
      return [];
    }
  }
}

module.exports = new CollectionsService();
