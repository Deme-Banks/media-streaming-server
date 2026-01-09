/**
 * Media Streaming Server - Refactored
 * Clean, modular architecture with separated routes
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const session = require('express-session');
const os = require('os');

// Import configuration
const config = require('./src/config');

// Import middleware
const { errorHandler } = require('./src/middleware/errorHandler');

// Import routes
const authRoutes = require('./src/routes/auth.routes');
const usersRoutes = require('./src/routes/users.routes');
const favoritesRoutes = require('./src/routes/favorites.routes');
const watchHistoryRoutes = require('./src/routes/watchHistory.routes');
const mediaRoutes = require('./src/routes/media.routes');
const searchRoutes = require('./src/routes/search.routes');
const apiRoutes = require('./src/routes/api.routes');
const streamingRoutes = require('./src/routes/streaming.routes');
const tvRoutes = require('./src/routes/tv.routes');
const mediaDetailsRoutes = require('./src/routes/mediaDetails.routes');
const combinedMediaRoutes = require('./src/routes/combinedMedia.routes');

const app = express();

// Middleware
app.use(cors(config.cors));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session(config.session));

// Ensure media directory exists
fs.ensureDirSync(config.mediaPath);

// API Routes
// Order matters: more specific routes first
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/watch-history', watchHistoryRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/streaming', streamingRoutes);
app.use('/api/tv', tvRoutes);

// Media routes - more specific first
app.use('/api/media', combinedMediaRoutes); // /api/media/all, /api/media/genres (more specific)
app.use('/api/media', mediaDetailsRoutes); // /api/media/:mediaId/details (more specific)
app.use('/api/media', mediaRoutes); // /api/media/:id (catch-all for local media)

// General API routes (featured, popular, bulk, etc.)
app.use('/api', apiRoutes); // /api/featured, /api/popular/*, /api/bulk/*, /api/genres

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    mediaPath: config.mediaPath,
    tmdbConfigured: !!config.tmdbApiKey && config.tmdbApiKey !== 'your_tmdb_api_key_here',
    omdbConfigured: !!config.omdbApiKey,
    apis: {
      tmdb: !!config.tmdbApiKey && config.tmdbApiKey !== 'your_tmdb_api_key_here',
      omdb: !!config.omdbApiKey,
      jikan: true, // Always available (no key needed)
      cinetaro: config.useCinetaro
    },
    message: config.tmdbApiKey && config.tmdbApiKey !== 'your_tmdb_api_key_here' 
      ? 'TMDB API key configured - movies and TV shows are loading from your API'
      : 'TMDB API key not configured - add TMDB_API_KEY to your .env file to see movies and TV shows'
  });
});

// Proxy for external images (to avoid CORS issues)
app.get('/api/image/:type/:source/:id', (req, res) => {
  try {
    const { type, source, id } = req.params;
    let imageUrl = null;

    if (source === 'tmdb') {
      imageUrl = `https://image.tmdb.org/t/p/w500${id}`;
    } else if (source === 'jikan') {
      imageUrl = id; // Jikan returns full URLs
    }

    if (!imageUrl) {
      return res.status(404).json({ error: 'Image not found' });
    }

    res.redirect(imageUrl);
  } catch (error) {
    console.error('Error proxying image:', error);
    res.status(500).json({ error: 'Failed to get image' });
  }
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Serve frontend (catch-all route)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Helper function to get local IP addresses
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({
          interface: name,
          address: iface.address
        });
      }
    }
  }
  
  return addresses;
}

// Start server
const server = app.listen(config.port, '0.0.0.0', () => {
  console.log('\n========================================');
  console.log('  Deme Movies - Media Streaming Server');
  console.log('========================================\n');
  console.log(`✅ Server running on port ${config.port}`);
  console.log(`\n📍 Access your server at:`);
  console.log(`   Local:   http://localhost:${config.port}`);
  
  // Display network IPs
  const localIPs = getLocalIP();
  if (localIPs.length > 0) {
    console.log(`\n🌐 Network access (from other devices):`);
    localIPs.forEach(ip => {
      console.log(`   ${ip.interface}: http://${ip.address}:${config.port}`);
      
      // Highlight WiFi/Ethernet
      if (ip.interface.toLowerCase().includes('wifi') || 
          ip.interface.toLowerCase().includes('wireless') ||
          ip.interface.toLowerCase().includes('wi-fi')) {
        console.log(`   👆 Use this address on your phone/tablet`);
      }
    });
  }
  
  console.log(`\n📁 Media directory: ${config.mediaPath}`);
  console.log(`🔑 TMDB API: ${config.tmdbApiKey ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`🔑 OMDb API: ${config.omdbApiKey ? '✅ Configured' : '⚠️  Not configured (optional)'}`);
  console.log(`🎬 Streaming: ${config.useCinetaro ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`\n========================================\n`);
  console.log('Press Ctrl+C to stop the server\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\nSIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

module.exports = app;
