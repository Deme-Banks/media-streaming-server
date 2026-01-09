/**
 * Application Configuration
 * Centralized configuration management
 */

require('dotenv').config();
const path = require('path');

module.exports = {
  // Server Configuration
  port: process.env.PORT || 3000,
  mediaPath: process.env.MEDIA_PATH || path.join(__dirname, '../../media'),
  
  // API Keys
  tmdbApiKey: process.env.TMDB_API_KEY || '',
  omdbApiKey: process.env.OMDB_API_KEY || '',
  sessionSecret: process.env.SESSION_SECRET || 'deme-movies-secret-key-change-in-production',
  
  // Feature Flags
  useCinetaro: process.env.USE_CINETARO !== 'false',
  
  // Session Configuration
  session: {
    secret: process.env.SESSION_SECRET || 'deme-movies-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Set to true if using HTTPS
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  },
  
  // CORS Configuration
  cors: {
    origin: true, // Allow all origins (for local network access)
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  
  // Cache Configuration
  cache: {
    expiry: 24 * 60 * 60 * 1000 // 24 hours
  }
};
