import { Transform, TransformCallback } from 'stream';

export const allowedExtensions = ['.ts', '.png', '.jpg', '.webp', '.ico', '.html', '.js', '.css', '.txt', '.key', '.mp4', '.mkv', '.avi'];

export class LineTransform extends Transform {
    private buffer: string;
    private baseUrl: string;
    private isMasterPlaylist: boolean = false;
    private originalHeaders: string; // Store original headers as query string

    constructor(baseUrl: string, originalHeaders?: string) {
        super();
        this.buffer = '';
        this.baseUrl = baseUrl;
        this.originalHeaders = originalHeaders || '';
        // Remove the filename and keep just the directory path
        this.baseUrl = this.baseUrl.replace(/[^\/]+$/, '');
        console.log(`CinemaOS Base URL set to: ${this.baseUrl}`);
    }

    _transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
        const data = this.buffer + chunk.toString();
        const lines = data.split(/\r?\n/);
        this.buffer = lines.pop() || '';

        // Pre-detect master playlist by checking all lines
        if (!this.isMasterPlaylist) {
            this.isMasterPlaylist = lines.some(line => 
                line.includes('#EXT-X-STREAM-INF:') || 
                line.includes('#EXT-X-I-FRAME-STREAM-INF:') ||
                (line.includes('#EXT-X-MEDIA:') && (line.includes('TYPE=AUDIO') || line.includes('TYPE=SUBTITLES')))
            );
            console.log(`CinemaOS: Detected ${this.isMasterPlaylist ? 'master' : 'media'} playlist`);
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

    private createProxyUrl(url: string): string {
        const separator = this.originalHeaders ? '&' : '';
        return `/cinemaos-proxy?url=${encodeURIComponent(url)}${separator}${this.originalHeaders}`;
    }

    private processLine(line: string): string {
        // Skip comments and blank lines (except for the important ones)
        if ((line.startsWith('#') &&
            !line.includes('#EXT-X-KEY') &&
            !line.includes('#EXT-X-MEDIA') &&
            !line.includes('#EXT-X-STREAM-INF') &&
            !line.includes('#EXT-X-I-FRAME-STREAM-INF')) ||
            line.trim() === '') {
            return line;
        }

        // Handle encryption key
        if (line.includes('#EXT-X-KEY:METHOD=AES-128,URI=')) {
            const match = line.match(/URI="([^"]+)"/);
            if (match && match[1]) {
                const keyPath = match[1];
                let keyUrl;

                if (keyPath.startsWith('http')) {
                    keyUrl = keyPath;
                } else if (keyPath.startsWith('../')) {
                    const baseUrlWithoutProtocol = this.baseUrl.replace(/^https?:\/\//, '');
                    const baseUrlParts = baseUrlWithoutProtocol.split('/').filter(part => part.length > 0);
                    const keyPathParts = keyPath.split('/').filter(part => part.length > 0);

                    let upLevels = 0;
                    for (const part of keyPathParts) {
                        if (part === '..') {
                            upLevels++;
                        } else {
                            break;
                        }
                    }

                    const actualKeyPath = keyPathParts.slice(upLevels).join('/');
                    const actualBaseParts = baseUrlParts.slice(0, baseUrlParts.length - upLevels);
                    const actualBasePath = actualBaseParts.join('/');

                    keyUrl = `https://${actualBasePath}/${actualKeyPath}`;
                    console.log(`CinemaOS: Constructed key URL: ${keyUrl}`);
                } else {
                    keyUrl = this.baseUrl + keyPath;
                }

                console.log(`CinemaOS: Proxying key: ${keyUrl}`);
                return line.replace(
                    `URI="${keyPath}"`,
                    `URI="${this.createProxyUrl(keyUrl)}"`
                );
            }
        }

        // Handle I-frame stream references in the URI parameter
        if (line.includes('#EXT-X-I-FRAME-STREAM-INF') && line.includes('URI=')) {
            const match = line.match(/URI="([^"]+)"/);
            if (match && match[1]) {
                const iframePath = match[1];
                
                if (iframePath.includes('/cinemaos-proxy?url=')) {
                    return line;
                }
                
                const iframeUrl = iframePath.startsWith('http')
                    ? iframePath
                    : this.baseUrl + iframePath;
                    
                console.log(`CinemaOS: Proxying I-frame stream: ${iframePath} → ${iframeUrl}`);
                return line.replace(
                    `URI="${iframePath}"`,
                    `URI="${this.createProxyUrl(iframeUrl)}"`
                );
            }
        }

        // Handle ANY EXT-X-MEDIA tags (audio, subtitles, etc.)
        if (line.includes('#EXT-X-MEDIA') && line.includes('URI="')) {
            const match = line.match(/URI="([^"]+)"/);
            if (match && match[1]) {
                const mediaPath = match[1];
                
                if (mediaPath.includes('/cinemaos-proxy?url=')) {
                    return line;
                }
                
                const mediaUrl = mediaPath.startsWith('http')
                    ? mediaPath
                    : this.baseUrl + mediaPath;

                console.log(`CinemaOS: Proxying media track: ${mediaPath} → ${mediaUrl}`);
                return line.replace(
                    `URI="${mediaPath}"`,
                    `URI="${this.createProxyUrl(mediaUrl)}"`
                );
            }
        }

        // Handle video stream entries in master playlist
        if (this.isMasterPlaylist && !line.startsWith('#') && line.includes('.m3u8')) {
            if (line.includes('/cinemaos-proxy?url=')) {
                return line;
            }
            
            const streamUrl = line.startsWith('http')
                ? line
                : this.baseUrl + line;
            console.log(`CinemaOS: Proxying video stream: ${line} → ${streamUrl}`);
            return this.createProxyUrl(streamUrl);
        }

        // Handle segment URLs (.ts files) in individual playlists
        if (!this.isMasterPlaylist && !line.startsWith('#') && line.endsWith('.ts')) {
            const segmentUrl = line.startsWith('http')
                ? line
                : this.baseUrl + line;
            console.log(`CinemaOS: Proxying segment: ${line} → ${segmentUrl}`);
            return this.createProxyUrl(segmentUrl);
        }

        // Handle subtitle files specifically
        if (!line.startsWith('#') && 
            (line.endsWith('.vtt') || line.endsWith('.srt') || line.endsWith('.ass'))) {
            const subtitleUrl = line.startsWith('http')
                ? line
                : this.baseUrl + line;
            console.log(`CinemaOS: Proxying subtitle file: ${line} → ${subtitleUrl}`);
            return this.createProxyUrl(subtitleUrl);
        }

        // Handle other static files
        if (!line.startsWith('#') && allowedExtensions.some(ext => line.endsWith(ext))) {
            const fileUrl = line.startsWith('http')
                ? line
                : this.baseUrl + line;
            console.log(`CinemaOS: Proxying static file: ${line} → ${fileUrl}`);
            return this.createProxyUrl(fileUrl);
        }

        return line;
    }
}