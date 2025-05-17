import { Transform, TransformCallback } from 'stream';

export const allowedExtensions = ['.ts', '.png', '.jpg', '.webp', '.ico', '.html', '.js', '.css', '.txt', '.key'];

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

        // Pre-detect master playlist by checking all lines
        if (!this.isMasterPlaylist) {
            this.isMasterPlaylist = lines.some(line => 
                line.includes('#EXT-X-STREAM-INF:') || 
                (line.includes('#EXT-X-MEDIA:') && line.includes('TYPE=AUDIO'))
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
        // Skip comments and blank lines (except for the important ones)
        if ((line.startsWith('#') &&
            !line.includes('#EXT-X-KEY') &&
            !line.includes('#EXT-X-MEDIA') &&
            !line.includes('#EXT-X-STREAM-INF')) ||
            line.trim() === '') {
            return line;
        }

        // Handle encryption key
        if (line.includes('#EXT-X-KEY:METHOD=AES-128,URI=')) {
            const match = line.match(/URI="([^"]+)"/);
            if (match && match[1]) {
                const keyPath = match[1];
                let keyUrl;

                // Handle relative path for key
                if (keyPath.startsWith('http')) {
                    keyUrl = keyPath;
                } else if (keyPath.startsWith('../')) {
                    // Handle relative paths like "../../keys/5qTeOBTz.key"
                    const baseUrlWithoutProtocol = this.baseUrl.replace(/^https?:\/\//, '');
                    const baseUrlParts = baseUrlWithoutProtocol.split('/').filter(part => part.length > 0);
                    const keyPathParts = keyPath.split('/').filter(part => part.length > 0);

                    // Count how many levels to go up
                    let upLevels = 0;
                    for (const part of keyPathParts) {
                        if (part === '..') {
                            upLevels++;
                        } else {
                            break;
                        }
                    }

                    // Remove the up-level parts from the keyPath
                    const actualKeyPath = keyPathParts.slice(upLevels).join('/');

                    // Remove the corresponding number of parts from baseUrl
                    const actualBaseParts = baseUrlParts.slice(0, baseUrlParts.length - upLevels);
                    const actualBasePath = actualBaseParts.join('/');

                    // Reconstruct the URL properly with only one https://
                    keyUrl = `https://${actualBasePath}/${actualKeyPath}`;
                    console.log(`Constructed key URL: ${keyUrl}`);
                } else {
                    // It's a relative path without ../
                    keyUrl = this.baseUrl + keyPath;
                }

                console.log(`Proxying key: ${keyUrl}`);
                return line.replace(
                    `URI="${keyPath}"`,
                    `URI="/anizone?url=${encodeURIComponent(keyUrl)}"`
                );
            }
        }

        // Handle ANY EXT-X-MEDIA tags (audio, subtitles, etc.)
        if (line.includes('#EXT-X-MEDIA') && line.includes('URI="')) {
            const match = line.match(/URI="([^"]+)"/);
            if (match && match[1]) {
                const mediaPath = match[1];
                
                // Skip if already proxied
                if (mediaPath.includes('/anizone?url=')) {
                    return line;
                }
                
                const mediaUrl = mediaPath.startsWith('http')
                    ? mediaPath
                    : this.baseUrl + mediaPath;

                console.log(`Proxying media track: ${mediaPath} → ${mediaUrl}`);
                return line.replace(
                    `URI="${mediaPath}"`,
                    `URI="/anizone?url=${encodeURIComponent(mediaUrl)}"`
                );
            }
        }

        // Handle video stream entries in master playlist
        if (this.isMasterPlaylist && !line.startsWith('#') && line.includes('.m3u8')) {
            // Skip if already proxied
            if (line.includes('/anizone?url=')) {
                return line;
            }
            
            const streamUrl = line.startsWith('http')
                ? line
                : this.baseUrl + line;
            console.log(`Proxying video stream: ${line} → ${streamUrl}`);
            return `/anizone?url=${encodeURIComponent(streamUrl)}`;
        }

        // Handle segment URLs (.ts files) in individual playlists
        if (!this.isMasterPlaylist && !line.startsWith('#') && line.endsWith('.ts')) {
            const segmentUrl = line.startsWith('http')
                ? line
                : this.baseUrl + line;
            console.log(`Proxying segment: ${line} → ${segmentUrl}`);
            return `/anizone?url=${encodeURIComponent(segmentUrl)}`;
        }

        // Handle other static files
        if (!line.startsWith('#') && allowedExtensions.some(ext => line.endsWith(ext))) {
            const fileUrl = line.startsWith('http')
                ? line
                : this.baseUrl + line;
            return `/anizone?url=${encodeURIComponent(fileUrl)}`;
        }

        return line;
    }
}