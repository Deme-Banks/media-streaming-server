# Deme Movies - Home Media Streaming Platform

A local home media streaming platform designed for household use. Stream your movies and videos from your local network with a beautiful, modern interface inspired by popular streaming services.

## Features

- 🎬 **Video Streaming**: Stream videos with support for MP4, AVI, MKV, MOV, and more
- 🎵 **Audio Support**: Play audio files (MP3, WAV, FLAC, AAC, etc.)
- 🔍 **Universal Search**: Search both your local media AND online movie/TV/anime databases
- 🌐 **Free APIs Integration**: 
  - **TMDB API** (free) - Movies and TV shows with posters, ratings, and metadata
  - **Jikan API** (free, no key needed) - Anime database with comprehensive information
  - Mix your local files with API content seamlessly
- 🎨 **Anime & Cartoons Support**: Special support for cartoons and anime with dedicated API integration
- 📱 **Responsive Design**: Works on desktop, tablet, and mobile devices
- 🎨 **Modern UI**: Clean, dark-themed interface similar to popular streaming platforms
- 🖼️ **Thumbnails & Posters**: Automatic thumbnails for local files + API posters for movies/shows/anime
- 📊 **Rich Metadata**: Display ratings, genres, episodes, overview, and more
- 🗂️ **Smart Filtering**: Filter by Recent, Popular, Genre, Year, or A-Z (works with both local and API content)
- 📄 **Pagination**: Easy navigation through large media libraries

## Prerequisites

- **Node.js** (v18 or higher)
- **npm** (comes with Node.js)
- **FFmpeg** (optional, for thumbnail generation and metadata extraction)
  - Download from [FFmpeg website](https://ffmpeg.org/download.html)
  - Make sure `ffmpeg` and `ffprobe` are in your system PATH

## Installation

1. Clone this repository or download the project files

2. Navigate to the project directory:
   ```bash
   cd media-streaming-server
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

## Configuration

### 1. Set Up Environment Variables

Create a `.env` file in the project root (or copy from `.env.example`):

```bash
# Copy the example file
cp .env.example .env
```

Edit `.env` with your settings:

```env
# Media Directory (optional)
MEDIA_PATH=./media

# Server Port (optional)
PORT=3000

# TMDB API Key (FREE - recommended for movies/TV shows)
# Get your free API key at: https://www.themoviedb.org/settings/api
TMDB_API_KEY=your_tmdb_api_key_here

# Cinetaro API (optional - for streaming links)
USE_CINETARO=false
```

### 2. Get a Free TMDB API Key (Recommended)

1. Visit [TMDB](https://www.themoviedb.org/)
2. Create a free account
3. Go to [Settings > API](https://www.themoviedb.org/settings/api)
4. Request an API key (free, no credit card needed)
5. Copy the API key and add it to your `.env` file

**Why TMDB?**
- ✅ Completely FREE
- ✅ No credit card required
- ✅ Millions of movies and TV shows
- ✅ High-quality posters and metadata
- ✅ Ratings, genres, cast info, and more

### 3. Jikan API (Anime) - No Key Needed!

The Jikan API is **free and requires no API key**. It will work automatically for anime searches and popular anime listings.

### 4. Set Media Directory (Optional)
   
By default, the server looks for media files in the `media` folder. You can change this in `.env`:
   
```env
MEDIA_PATH=C:\Users\YourName\Videos
```

### 5. Add Your Media Files
   
Place your video and audio files (including cartoons and anime) in the media directory. The server will automatically:
- Scan and index your local files
- Combine them with API content (movies, TV shows, anime)
- Display everything in a unified interface

## Usage

1. **Install Dependencies** (if not already done):
   ```bash
   npm install
   ```

2. **Configure your `.env` file** (see Configuration section above)

3. **Start the server**:
   ```bash
   npm start
   ```
   
   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

4. **Open your browser** and navigate to:
   ```
   http://localhost:3000
   ```

5. **What you'll see**:
   - **Featured Section**: Popular movies and anime from APIs
   - **Your Local Media**: All your local files (movies, TV shows, cartoons, anime)
   - **Search**: Search both local files AND online databases
   - **Filter Tabs**: Browse by All, Recent, Popular, Genre, Year, or A-Z
   - **Mixed Content**: Local files and API content displayed together seamlessly

### How It Works

- **Local Files**: Scans your `media` directory and displays them with thumbnails (if FFmpeg is installed)
- **API Content**: Fetches movies, TV shows, and anime from free APIs with posters, ratings, and metadata
- **Combined View**: Both local and API content appear together - you can browse everything in one place
- **Search**: Search works across both local files and API databases simultaneously

## Port Configuration

To change the server port, set the `PORT` environment variable:

```bash
# Windows PowerShell
$env:PORT=8080; npm start

# Linux/Mac
PORT=8080 npm start
```

## Project Structure

```
media-streaming-server/
├── src/
│   └── services/
│       ├── mediaScanner.js    # Scans media directory and extracts metadata
│       └── mediaStreamer.js   # Handles media streaming with range requests
├── public/
│   ├── css/
│   │   └── style.css          # Styles for the web interface
│   ├── js/
│   │   └── app.js             # Frontend JavaScript
│   └── index.html             # Main HTML page
├── media/                      # Default media directory (create this)
├── .cache/
│   └── thumbnails/            # Generated thumbnails (auto-created)
├── server.js                   # Main server file
├── package.json                # Node.js dependencies
└── README.md                   # This file
```

## Supported Formats

### Video Formats
- MP4, AVI, MKV, MOV, WMV, FLV, WebM, M4V, 3GP, OGV

### Audio Formats
- MP3, WAV, FLAC, AAC, OGG, M4A, WMA, Opus

## API Endpoints

### Local Media
- `GET /api/media` - Get all local media files
- `GET /api/media/:id` - Get specific local media metadata
- `GET /api/stream/:id` - Stream a local media file (supports range requests)
- `GET /api/thumbnail/:id` - Get thumbnail for a local video

### Online Content (Free APIs)
- `GET /api/search?q=query&page=1` - Universal search (movies, TV shows, anime)
- `GET /api/featured` - Get featured popular content from APIs
- `GET /api/popular/movies?page=1` - Get popular movies from TMDB
- `GET /api/popular/anime?page=1` - Get popular anime from Jikan
- `GET /api/cartoons?page=1` - Get animation/cartoon movies

### Combined
- `GET /api/media/all?page=1&source=all` - Get all media (local + API)
- `GET /api/health` - Health check endpoint (shows API configuration status)

## Features Without FFmpeg

The server will still work without FFmpeg installed:
- ✅ Media scanning and streaming will work
- ✅ API content will show posters and metadata (no FFmpeg needed!)
- ✅ Basic metadata from file system (size, date)
- ❌ Video duration and resolution for local files will not be available
- ❌ Thumbnails for local files will not be generated

**Note**: API content (movies, TV shows, anime) doesn't require FFmpeg - they come with posters and metadata from the APIs!

## Anime & Cartoons

### Anime Support
- **Jikan API**: Free anime database (no API key needed)
- Search for anime titles
- View ratings, genres, episodes, and synopsis
- Get posters and images automatically

### Cartoons Support
- **TMDB API**: Animation genre movies and TV shows
- Filter by "Genre" to see cartoons
- Search for cartoon titles
- Mix with your local cartoon/anime files

### How to Add Your Anime/Cartoons

1. **Add Local Files**: Put your anime/cartoon video files in the `media` folder
2. **Search API**: Use the search bar to find anime titles from the Jikan database
3. **Both Together**: Local files and API content will appear together in your library

## Troubleshooting

### Media files not showing up
- Make sure your media files are in the correct directory
- Check that the file extensions are supported
- Restart the server after adding new files
- Check the console for any error messages

### Thumbnails not generating
- Ensure FFmpeg is installed and in your system PATH
- Verify that `ffmpeg` and `ffprobe` commands work in your terminal
- Check the console for FFmpeg-related errors

### Streaming issues
- Make sure the media files are not corrupted
- Check that the files are not in use by another application
- Verify your network connection if streaming over the network

## Security Notes

This is designed for **local home use only**. Do not expose this server to the internet without proper security measures:

- Add authentication if needed
- Use HTTPS in production
- Restrict network access if running on a public network
- Regularly update dependencies

## License

MIT License - feel free to use this project for your personal home media streaming needs.

## Contributing

Feel free to fork this project and customize it for your needs. Pull requests are welcome!

## Author

Created by Deme-Banks

---

Enjoy streaming your media! 🎬✨

