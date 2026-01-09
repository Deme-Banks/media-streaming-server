/**
 * Utility: Combine local media with API content
 */

const MovieAPI = require('../services/movieAPI');
const MediaScanner = require('../services/mediaScanner');
const config = require('../config');

const movieAPI = new MovieAPI();
const mediaScanner = new MediaScanner(config.mediaPath);

/**
 * Combine local media files with API content
 * Handles deduplication, filtering, and genre filtering
 */
async function combineMedia(options = {}) {
  const { genre, type } = options;
  
  // Get local media
  let localMedia = [];
  try {
    localMedia = await mediaScanner.scan();
  } catch (error) {
    console.warn('Error scanning local media:', error.message);
  }
  
  // Get API content from multiple sources
  const apiContent = [];
  
  try {
    // This would typically be fetched from cache or bulk endpoints
    // For now, return empty array - will be populated by frontend via bulk endpoints
  } catch (error) {
    console.warn('Error fetching API content:', error.message);
  }
  
  // Combine and deduplicate
  const combined = [...localMedia, ...apiContent];
  
  // Filter by type if specified
  let filtered = combined;
  if (type && type !== 'all') {
    filtered = filtered.filter(item => {
      if (type === 'movie') return item.type === 'movie' || !item.type;
      if (type === 'tv') return item.type === 'tv';
      if (type === 'anime') return item.type === 'anime';
      return true;
    });
  }
  
  // Filter by genre if specified
  if (genre && genre !== 'all') {
    filtered = filtered.filter(item => {
      const genres = item.genres || [];
      return genres.some(g => 
        g.toLowerCase() === genre.toLowerCase() || 
        g.toLowerCase().includes(genre.toLowerCase())
      );
    });
  }
  
  // Deduplicate
  const deduplicated = movieAPI.deduplicateMedia(filtered);
  
  return deduplicated;
}

module.exports = {
  combineMedia
};
