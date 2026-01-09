const fs = require('fs-extra');
const path = require('path');
const mime = require('mime-types');

class MediaStreamer {
  constructor(mediaPath) {
    this.mediaPath = mediaPath;
    this.chunkSize = 10 ** 6; // 1MB chunks
  }

  async stream(req, res, filePath, range) {
    try {
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;
      const mimeType = mime.lookup(filePath) || 'video/mp4';

      // If no range header, send entire file
      if (!range) {
        res.writeHead(200, {
          'Content-Type': mimeType,
          'Content-Length': fileSize,
          'Accept-Ranges': 'bytes',
        });
        const stream = fs.createReadStream(filePath);
        return stream.pipe(res);
      }

      // Parse range header
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const stream = fs.createReadStream(filePath, { start, end });

      // Set response headers for partial content
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': mimeType,
      });

      stream.pipe(res);

      stream.on('error', (error) => {
        console.error('Stream error:', error);
        if (!res.headersSent) {
          res.status(500).end();
        }
      });
    } catch (error) {
      console.error('Error in stream method:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Streaming error' });
      }
    }
  }
}

module.exports = MediaStreamer;

