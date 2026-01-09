# Quick Setup Guide

## Step 1: Install Node.js (if not already installed)

1. Download Node.js from [nodejs.org](https://nodejs.org/)
   - Choose the LTS version (recommended)
   - Windows: Download the `.msi` installer
   
2. Run the installer and follow the instructions
   - Make sure "Add to PATH" is checked
   
3. Verify installation:
   ```bash
   node --version
   npm --version
   ```
   Both commands should show version numbers.

## Step 2: Install Dependencies

1. Open terminal/PowerShell in the project directory:
   ```bash
   cd media-streaming-server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

   This will install:
   - express (web server)
   - axios (for API calls)
   - dotenv (for environment variables)
   - And other required packages

## Step 3: Configure API Keys (Optional but Recommended)

### Get Free TMDB API Key (for Movies/TV Shows)

1. Visit https://www.themoviedb.org/
2. Click "Sign Up" to create a free account
3. After logging in, go to https://www.themoviedb.org/settings/api
4. Click "Request an API Key"
5. Select "Developer" as the type
6. Fill out the form (all fields are required):
   - Application URL: `http://localhost:3000`
   - Application Summary: "Home media streaming server"
7. Accept the terms and submit
8. Copy your API key

### Add API Key to Project

1. In the project directory, copy `.env.example` to `.env`:
   ```bash
   # Windows PowerShell
   Copy-Item .env.example .env
   
   # Windows CMD
   copy .env.example .env
   
   # Linux/Mac
   cp .env.example .env
   ```

2. Open `.env` in a text editor and add your TMDB API key:
   ```env
   TMDB_API_KEY=your_api_key_here
   ```

**Note**: Jikan API (for anime) works automatically - no API key needed!

## Step 4: Add Your Media Files

1. Create a `media` folder in the project directory (or use your own path)
2. Add your video/audio files:
   - Movies
   - TV Shows
   - Cartoons
   - Anime
   - Music
3. Supported formats:
   - **Video**: MP4, AVI, MKV, MOV, WMV, FLV, WebM, M4V, 3GP, OGV
   - **Audio**: MP3, WAV, FLAC, AAC, OGG, M4A, WMA, Opus

## Step 5: Start the Server

```bash
npm start
```

You should see:
```
🚀 Deme Movies Streaming Server running on http://localhost:3000
📁 Media directory: ./media

Open your browser to http://localhost:3000 to start streaming!
```

## Step 6: Open in Browser

Navigate to: **http://localhost:3000**

## Optional: Install FFmpeg (for Local File Thumbnails)

1. Download FFmpeg from https://ffmpeg.org/download.html
2. Extract and add to PATH
3. Verify installation:
   ```bash
   ffmpeg -version
   ffprobe -version
   ```

FFmpeg enables:
- Thumbnail generation for local video files
- Video duration and resolution extraction
- Better metadata for local files

**Note**: FFmpeg is optional - the server works without it, and API content doesn't need it!

## Troubleshooting

### "npm is not recognized"
- Node.js is not installed or not in PATH
- Reinstall Node.js and make sure "Add to PATH" is checked
- Restart your terminal after installation

### "Cannot find module"
- Run `npm install` again
- Delete `node_modules` folder and `package-lock.json`, then run `npm install`

### API search not working
- Check that your TMDB API key is correct in `.env` file
- Make sure `.env` file is in the project root directory
- Restart the server after changing `.env`

### Media files not showing
- Check that files are in the correct directory (default: `./media`)
- Verify file extensions are supported
- Check console for error messages
- Restart server after adding new files

### Port already in use
- Change PORT in `.env` file to a different number (e.g., 3001, 8080)
- Or stop the process using port 3000

## Next Steps

- Customize the media directory path in `.env`
- Add more media files
- Explore the search and filter features
- Mix local files with API content!

Enjoy your personal media streaming platform! 🎬✨

