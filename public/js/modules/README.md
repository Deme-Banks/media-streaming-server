# Frontend Modules Structure

This directory contains organized modules for the frontend application.

## Module Organization

- **state.js** - Global application state management
- **apiSettings.js** - API toggle settings management
- **auth.js** - Authentication (login, register, logout)
- **media.js** - Media loading, display, and filtering
- **search.js** - Search functionality with suggestions
- **player.js** - Video player and playback controls
- **tvEpisodes.js** - TV show episode navigation
- **favorites.js** - Favorites management
- **watchHistory.js** - Watch history and continue watching
- **collections.js** - Collections/playlists
- **ui.js** - UI helpers and event listeners

## Usage

For backward compatibility with inline handlers in HTML, all functions are exported to the `window` object.

The main `app.js` file imports and initializes all modules.
