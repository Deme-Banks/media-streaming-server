const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime-types');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class MediaScanner {
  constructor(mediaPath) {
    this.mediaPath = mediaPath;
    this.mediaCache = new Map();
    this.thumbnailsPath = path.join(__dirname, '../../.cache/thumbnails');
    fs.ensureDirSync(this.thumbnailsPath);
  }

  // Supported video extensions
  isVideoFile(filePath) {
    const videoExts = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp', '.ogv'];
    const ext = path.extname(filePath).toLowerCase();
    return videoExts.includes(ext);
  }

  // Supported audio extensions
  isAudioFile(filePath) {
    const audioExts = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.opus'];
    const ext = path.extname(filePath).toLowerCase();
    return audioExts.includes(ext);
  }

  // Check if file is a media file
  isMediaFile(filePath) {
    return this.isVideoFile(filePath) || this.isAudioFile(filePath);
  }

  // Scan directory for media files
  async scanDirectory(dir) {
    const files = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        // Skip hidden files and directories
        if (entry.name.startsWith('.')) continue;
        
        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          const subFiles = await this.scanDirectory(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && this.isMediaFile(fullPath)) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dir}:`, error.message);
    }
    
    return files;
  }

  // Get file metadata using ffprobe
  async getFileMetadata(filePath) {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`
      );
      return JSON.parse(stdout);
    } catch (error) {
      // If ffprobe is not available, return null (graceful degradation)
      console.warn(`ffprobe not available or error for ${filePath}:`, error.message);
      return null;
    }
  }

  // Extract duration in seconds
  extractDuration(metadata) {
    if (metadata && metadata.format && metadata.format.duration) {
      return parseFloat(metadata.format.duration);
    }
    return 0;
  }

  // Extract video resolution
  extractResolution(metadata) {
    if (!metadata || !metadata.streams) return null;
    
    const videoStream = metadata.streams.find(s => s.codec_type === 'video');
    if (videoStream && videoStream.width && videoStream.height) {
      return {
        width: videoStream.width,
        height: videoStream.height
      };
    }
    return null;
  }

  // Generate thumbnail using ffmpeg
  async generateThumbnail(videoPath, thumbnailPath) {
    try {
      await execAsync(
        `ffmpeg -i "${videoPath}" -ss 00:00:05 -vframes 1 -vf "scale=320:-1" -y "${thumbnailPath}"`
      );
      return true;
    } catch (error) {
      // If ffmpeg is not available, return false (graceful degradation)
      console.warn(`ffmpeg not available or error for ${videoPath}:`, error.message);
      return false;
    }
  }

  // Scan media library
  async scan() {
    console.log('Scanning media library...');
    const mediaFiles = await this.scanDirectory(this.mediaPath);
    const mediaList = [];

    for (const filePath of mediaFiles) {
      try {
        const stats = await fs.stat(filePath);
        const id = uuidv4();
        const relativePath = path.relative(this.mediaPath, filePath);
        const ext = path.extname(filePath).toLowerCase();
        const mimeType = mime.lookup(filePath) || 'application/octet-stream';
        
        const mediaItem = {
          id,
          title: path.basename(filePath, ext),
          path: filePath,
          relativePath,
          type: this.isVideoFile(filePath) ? 'video' : 'audio',
          mimeType,
          size: stats.size,
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime,
          extension: ext,
          duration: 0,
          resolution: null,
          hasThumbnail: false
        };

        // Get detailed metadata for video files
        if (this.isVideoFile(filePath)) {
          const metadata = await this.getFileMetadata(filePath);
          if (metadata) {
            mediaItem.duration = this.extractDuration(metadata);
            mediaItem.resolution = this.extractResolution(metadata);

            // Generate thumbnail
            const thumbnailPath = path.join(this.thumbnailsPath, `${id}.jpg`);
            const thumbnailGenerated = await this.generateThumbnail(filePath, thumbnailPath);
            mediaItem.hasThumbnail = thumbnailGenerated;
          }
        } else if (this.isAudioFile(filePath)) {
          const metadata = await this.getFileMetadata(filePath);
          if (metadata) {
            mediaItem.duration = this.extractDuration(metadata);
          }
        }

        this.mediaCache.set(id, mediaItem);
        mediaList.push(mediaItem);
      } catch (error) {
        console.error(`Error processing ${filePath}:`, error.message);
      }
    }

    console.log(`Found ${mediaList.length} media files`);
    return mediaList;
  }

  // Get media item by ID
  getMediaItem(id) {
    return this.mediaCache.get(id);
  }

  // Get media path by ID
  async getMediaPath(id) {
    const mediaItem = this.mediaCache.get(id);
    return mediaItem ? mediaItem.path : null;
  }

  // Get metadata for a specific media item
  async getMetadata(id) {
    const mediaItem = this.mediaCache.get(id);
    if (!mediaItem) return null;

    // Refresh metadata if needed
    if (this.isVideoFile(mediaItem.path)) {
      const metadata = await this.getFileMetadata(mediaItem.path);
      if (metadata) {
        mediaItem.duration = this.extractDuration(metadata);
        mediaItem.resolution = this.extractResolution(metadata);
      }
    }

    return mediaItem;
  }

  // Get thumbnail path
  async getThumbnail(id) {
    const mediaItem = this.mediaCache.get(id);
    if (!mediaItem || !mediaItem.hasThumbnail) return null;

    return path.join(this.thumbnailsPath, `${id}.jpg`);
  }
}

module.exports = MediaScanner;

