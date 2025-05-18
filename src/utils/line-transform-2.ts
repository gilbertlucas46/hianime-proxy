import { Transform, TransformCallback } from 'stream';

export const allowedExtensions = ['.ts', '.png', '.jpg', '.webp', '.ico', '.html', '.js', '.css', '.txt'];

export class LineTransform extends Transform {
  private buffer: string;
  private baseUrl: string;
  private isMasterPlaylist: boolean = false;

  constructor(baseUrl: string) {
    super();
    this.buffer = '';
    this.baseUrl = baseUrl;
    // Remove the filename and keep just the directory path
    this.baseUrl = this.baseUrl.replace(/[^\/]+$/, '');
    console.log(`Base URL set to: ${this.baseUrl}`);
  }

  _transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
    const data = this.buffer + chunk.toString();
    const lines = data.split(/\r?\n/);
    this.buffer = lines.pop() || '';

    // Detect if this is a master playlist by checking for EXT-X-STREAM-INF tag
    if (!this.isMasterPlaylist) {
      this.isMasterPlaylist = lines.some(line => 
        line.includes('#EXT-X-STREAM-INF:') || 
        line.includes('#EXT-X-I-FRAME-STREAM-INF:')
      );
      console.log(`Detected ${this.isMasterPlaylist ? 'master' : 'media'} playlist`);
    }

    for (const line of lines) {
      const modifiedLine = this.processLine(line);
      this.push(modifiedLine + '\n');
    }

    callback();
  }

  _flush(callback: TransformCallback) {
    if (this.buffer) {
      const modifiedLine = this.processLine(this.buffer);
      this.push(modifiedLine);
    }
    callback();
  }

  private processLine(line: string): string {
    // Skip comments and blank lines except for important ones
    if ((line.startsWith('#') && 
        !line.includes('#EXT-X-STREAM-INF') && 
        !line.includes('#EXT-X-I-FRAME-STREAM-INF')) || 
        line.trim() === '') {
      return line;
    }

    // Handle I-frame stream references in the URI parameter
    if (line.includes('#EXT-X-I-FRAME-STREAM-INF') && line.includes('URI=')) {
      const match = line.match(/URI="([^"]+)"/);
      if (match && match[1]) {
        const iframePath = match[1];
        const iframeUrl = this.baseUrl + iframePath;
        console.log(`Proxying I-frame stream: ${iframePath} → ${iframeUrl}`);
        return line.replace(
          `URI="${iframePath}"`,
          `URI="/m3u8-proxy-2?url=${encodeURIComponent(iframeUrl)}"`
        );
      }
    }

    // Handle variant streams (non-comment lines in master playlist)
    if (this.isMasterPlaylist && !line.startsWith('#') && line.endsWith('.m3u8')) {
      const streamUrl = this.baseUrl + line;
      console.log(`Proxying variant stream: ${line} → ${streamUrl}`);
      return `/m3u8-proxy-2?url=${encodeURIComponent(streamUrl)}`;
    }
    
    // Handle segment files (.ts) in media playlists
    if (!this.isMasterPlaylist && !line.startsWith('#') && line.endsWith('.ts')) {
      const segmentUrl = this.baseUrl + line;
      console.log(`Proxying segment: ${line} → ${segmentUrl}`);
      return `/m3u8-proxy-2?url=${encodeURIComponent(segmentUrl)}`;
    }

    // Handle other static files
    if (!line.startsWith('#') && allowedExtensions.some(ext => line.endsWith(ext))) {
      const fileUrl = line.startsWith('http') 
        ? line 
        : this.baseUrl + line;
      return `/m3u8-proxy-2?url=${encodeURIComponent(fileUrl)}`;
    }

    return line;
  }
}