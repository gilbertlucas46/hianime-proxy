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
    // Handle encryption key
    if (line.includes('#EXT-X-KEY:METHOD=AES-128,URI=')) {
        // Extract the URI value
        const match = line.match(/URI="([^"]+)"/);
        if (match && match[1]) {
            const keyUrl = match[1];
            // Replace the original URL with our proxied URL
            return line.replace(
                `URI="${keyUrl}"`, 
                `URI="https://hianime-proxy-green.vercel.app/m3u8-proxy-3?url=${keyUrl}"`
            );
        }
    }
    if (line.endsWith('.m3u8') || line.endsWith('.ts')) {
      return `https://hianime-proxy-green.vercel.app/m3u8-proxy-3?url=${this.baseUrl}${line}`;
    }

    if (allowedExtensions.some(ext => line.endsWith(ext))) {
      return `https://hianime-proxy-green.vercel.app/m3u8-proxy-3?url=${line}`;
    }

    return line;
  }
}
