import { Transform, TransformCallback } from 'stream';
import axios from 'axios';

export const allowedExtensions = ['.ts', '.png', '.jpg', '.webp', '.ico', '.html', '.js', '.css', '.txt'];

export class LineTransform extends Transform {
  private buffer: string;
  private baseUrl: string;
  private keyCache: Map<string, string>;

  constructor(baseUrl: string) {
    super();
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
    // Skip comments and blank lines (except for the important ones)
    if ((line.startsWith('#') &&
      !line.includes('#EXT-X-KEY') &&
      !line.startsWith('#EXTINF')) ||
      line.trim() === '') {
      return line;
    }

    // Handle encryption key
    if (line.includes('#EXT-X-KEY:METHOD=AES-128,URI=')) {
      // Extract the URI value
      const match = line.match(/URI="([^"]+)"/);
      if (match && match[1]) {
        const keyUrl = match[1];

        console.log(`Found key URL: ${keyUrl}`);
        // Use our proxy for the key - ensure it's absolute path starting with /
        return line.replace(
          `URI="${keyUrl}"`,
          `URI="/m3u8-proxy-3?url=${encodeURIComponent(keyUrl)}"`
        );
      }
    }

    // Handle segment URLs (.jpg files in this case)
    if (!line.startsWith('#') && (
      line.endsWith('.jpg') ||
      line.endsWith('.m3u8') ||
      allowedExtensions.some(ext => line.endsWith(ext))
    )) {
      // Check if it's a full URL or a relative path
      if (line.startsWith('http')) {
        return `m3u8-proxy-3?url=${encodeURIComponent(line)}`;
      } else {
        return `m3u8-proxy-3?url=${encodeURIComponent(this.baseUrl + line)}`;
      }
    }

    return line;
  }
}