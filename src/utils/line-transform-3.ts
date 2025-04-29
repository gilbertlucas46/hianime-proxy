import { Transform, TransformCallback } from 'stream';
import axios from 'axios';

export const allowedExtensions = ['.ts', '.png', '.jpg', '.webp', '.ico', '.html', '.js', '.css', '.txt'];

export class LineTransform extends Transform {
  private buffer: string;
  private baseUrl: string;
  private keyCache: Map<string, string>;

  constructor(baseUrl: string) {
    super({ objectMode: true });
    this.buffer = '';
    this.baseUrl = baseUrl;
    this.keyCache = new Map();
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
          callback(err);
        });
    } else {
      callback();
    }
  }

  private async processLine(line: string): Promise<string> {
    // Handle encryption key
    if (line.includes('#EXT-X-KEY:METHOD=AES-128,URI=')) {
      // Extract the URI value
      const match = line.match(/URI="([^"]+)"/);
      if (match && match[1]) {
        const keyUrl = match[1];
        
        try {
          // Check if we already have this key cached
          if (!this.keyCache.has(keyUrl)) {
            // Fetch the key
            const response = await axios.get(keyUrl, {
              responseType: 'arraybuffer',
              headers: { 
                'Accept': '*/*',
                'Referer': 'https://kwik.si',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
              }
            });
            
            // Convert the binary key to base64
            const keyData = Buffer.from(response.data).toString('base64');
            // Cache it
            this.keyCache.set(keyUrl, keyData);
          }
          
          // Get the cached key data
          const keyData = this.keyCache.get(keyUrl);
          // Replace the URI with a data URI containing the key
          return line.replace(
            `URI="${keyUrl}"`,
            `URI="data:application/octet-stream;base64,${keyData}"`
          );
        } catch (error) {
          console.error(`Error fetching key: ${error}`);
          // Fall back to proxying if fetching fails
          return line.replace(
            `URI="${keyUrl}"`, 
            `URI="m3u8-proxy-3?url=${encodeURIComponent(keyUrl)}"`
          );
        }
      }
    }
    
    if (line.endsWith('.m3u8') || line.endsWith('.ts')) {
      return `m3u8-proxy-3?url=${encodeURIComponent(this.baseUrl + line)}`;
    }

    if (allowedExtensions.some(ext => line.endsWith(ext))) {
      return `m3u8-proxy-3?url=${encodeURIComponent(line)}`;
    }

    return line;
  }
}