import { Transform, TransformCallback } from 'stream';

export const allowedExtensions = ['.ts', '.png', '.jpg', '.webp', '.ico', '.html', '.js', '.css', '.txt'];

export class LineTransform extends Transform {
  private buffer: string;
  private baseUrl: string;

  constructor(baseUrl: string) {
    super();
    this.buffer = '';
    this.baseUrl = baseUrl;
  }

  _transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
    const data = this.buffer + chunk.toString();
    const lines = data.split(/\r?\n/);
    this.buffer = lines.pop() || '';

    // Process all lines except the last one (which might be incomplete)
    const processLinePromises = lines.map(line => this.processLine(line));
    
    Promise.all(processLinePromises)
      .then(modifiedLines => {
        modifiedLines.forEach(line => {
          this.push(line + '\n');
        });
        callback();
      })
      .catch(err => {
        console.error('Error in transform:', err);
        callback(err);
      });
  }

  _flush(callback: TransformCallback) {
    if (this.buffer) {
      this.processLine(this.buffer)
        .then(modifiedLine => {
          this.push(modifiedLine);
          callback();
        })
        .catch(err => {
          console.error('Error in flush:', err);
          callback(err);
        });
    } else {
      callback();
    }
  }

  private async processLine(line: string): Promise<string> {
    // Skip comments and blank lines (except for important ones)
    if ((line.startsWith('#') && 
         !line.includes('#EXT-X-KEY') && 
         !line.startsWith('#EXTINF')) || 
        line.trim() === '') {
      return line;
    }

    // Handle encryption key
    if (line.includes('#EXT-X-KEY:METHOD=AES-128,URI=')) {
      const match = line.match(/URI="([^"]+)"/);
      if (match && match[1]) {
        const keyUrl = match[1];
        console.log(`Found key URL: ${keyUrl}`);
        
        // Always use absolute path with leading slash for the proxy
        return line.replace(
          `URI="${keyUrl}"`,
          `URI="/m3u8-proxy-3?url=${encodeURIComponent(keyUrl)}"`
        );
      }
    }
    
    // Handle segment URLs (not starting with #)
    if (!line.startsWith('#')) {
      let fullUrl;
      
      // If it's already a full URL, use it as is
      if (line.startsWith('http')) {
        fullUrl = line;
      } else {
        // Otherwise, it's a relative path, prepend baseUrl
        fullUrl = this.baseUrl + line;
      }
      
      // Return the proxied URL with absolute path
      return `/m3u8-proxy-3?url=${encodeURIComponent(fullUrl)}`;
    }
    
    return line;
  }
}