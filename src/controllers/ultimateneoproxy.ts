import axios from "axios";
import { Request, Response } from "express";
import { Transform, TransformCallback } from 'stream';
import * as crypto from 'crypto';
import { decode } from "punycode";

// Extended allowed extensions for various media formats
export const allowedExtensions = [
    '.ts', '.m4s', '.mp4', '.webm', '.mkv', '.avi', '.mov',
    '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.svg',
    '.html', '.js', '.css', '.txt', '.json', '.xml',
    '.key', '.vtt', '.srt', '.ass', '.ttml', '.dfxp',
    '.woff', '.woff2', '.ttf', '.eot'
];

interface DecodedPayload {
    u: string; // URL
    o?: string; // Origin
    r?: string; // Referer
    h?: string; // Hash or additional header
    ua?: string; // User Agent
    [key: string]: any; // Allow additional custom properties
}

export class If9YoutubeM3U8Transform extends Transform {
    private buffer: string;
    private baseHost: string;
    private originalHeaders: string;

    constructor(originalUrl: string, originalHeaders?: string) {
        super();
        this.buffer = '';
        // Extract the base host from the original URL
        const urlMatch = originalUrl.match(/^(https?:\/\/[^\/]+)/);
        this.baseHost = urlMatch ? urlMatch[1] : '';
        this.originalHeaders = originalHeaders || '';
        console.log(`If9Youtube M3U8 Transform: Base host set to: ${this.baseHost}`);
    }

    _transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
        const data = this.buffer + chunk.toString();
        const lines = data.split(/\r?\n/);
        this.buffer = lines.pop() || '';

        for (const line of lines) {
            const modifiedLine = this.processIf9Line(line);
            this.push(modifiedLine + '\n');
        }

        callback();
    }

    _flush(callback: TransformCallback) {
        if (this.buffer) {
            const modifiedLine = this.processIf9Line(this.buffer);
            this.push(modifiedLine);
        }
        callback();
    }

    private processIf9Line(line: string): string {
        const trimmedLine = line.trim();

        // Skip empty lines and most comments
        if (trimmedLine === '' || (trimmedLine.startsWith('#') && !this.isIf9ImportantTag(trimmedLine))) {
            return line;
        }

        // Handle URI attributes in tags
        if (trimmedLine.includes('URI=') && trimmedLine.includes('"')) {
            return this.processIf9UriLine(line);
        }

        // Handle non-comment lines (URLs that need to be converted to proxy URLs)
        if (!trimmedLine.startsWith('#') && trimmedLine.length > 0) {
            return this.processIf9UrlLine(trimmedLine);
        }

        return line;
    }

    private isIf9ImportantTag(line: string): boolean {
        return line.includes('URI=');
    }

    private processIf9UrlLine(url: string): string {
        // Check if it's already a proxied URL
        if (url.includes('/encoded-proxy?url=')) {
            return url;
        }

        // For if9.ppzj-youtube.cfd, check if it's a full URL or relative
        let fullUrl: string;
        if (url.startsWith('https://') || url.startsWith('http://')) {
            fullUrl = url;
        } else {
            // Relative URL - construct full URL
            fullUrl = url.startsWith('/') ? `${this.baseHost}${url}` : `${this.baseHost}/${url}`;
        }

        return this.createIf9ProxyUrl(fullUrl);
    }

    private processIf9UriLine(line: string): string {
        const uriMatch = line.match(/URI="([^"]+)"/);
        if (uriMatch && uriMatch[1]) {
            const originalUrl = uriMatch[1];
            
            // Check if it's already a proxied URL
            if (originalUrl.includes('/encoded-proxy?url=')) {
                return line;
            }

            let fullUrl: string;
            if (originalUrl.startsWith('https://') || originalUrl.startsWith('http://')) {
                fullUrl = originalUrl;
            } else {
                // Relative URL - construct full URL
                fullUrl = originalUrl.startsWith('/') ? `${this.baseHost}${originalUrl}` : `${this.baseHost}/${originalUrl}`;
            }

            const proxyUrl = this.createIf9ProxyUrl(fullUrl);
            return line.replace(`URI="${originalUrl}"`, `URI="${proxyUrl}"`);
        }
        return line;
    }

    private createIf9ProxyUrl(url: string): string {
        const separator = this.originalHeaders ? '&' : '';
        
        // Create base64 encoded payload for the URL
        const payload: DecodedPayload = {
            u: url,
            o: 'https://if9.ppzj-youtube.cfd',
            r: 'https://if9.ppzj-youtube.cfd/',
            h: this.generateIf9Hash(url)
        };

        const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64');
        return `/encoded-proxy?url=${encodeURIComponent(`https://if9.ppzj-youtube.cfd/${encodedPayload}.m3u8`)}${separator}${this.originalHeaders}`;
    }

    private generateIf9Hash(url: string): string {
        return crypto.createHash('md5').update(url + Date.now().toString()).digest('hex').substring(0, 8);
    }
}

export class JillianDescribeM3U8Transform extends Transform {
    private buffer: string;
    private baseHost: string;
    private originalHeaders: string;

    constructor(originalUrl: string, originalHeaders?: string) {
        super();
        this.buffer = '';
        // Extract the base host from the original URL
        const urlMatch = originalUrl.match(/^(https?:\/\/[^\/]+)/);
        this.baseHost = urlMatch ? urlMatch[1] : '';
        this.originalHeaders = originalHeaders || '';
        console.log(`JillianDescribe M3U8 Transform: Base host set to: ${this.baseHost}`);
    }

    _transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
        const data = this.buffer + chunk.toString();
        const lines = data.split(/\r?\n/);
        this.buffer = lines.pop() || '';

        for (const line of lines) {
            const modifiedLine = this.processJillianLine(line);
            this.push(modifiedLine + '\n');
        }

        callback();
    }

    _flush(callback: TransformCallback) {
        if (this.buffer) {
            const modifiedLine = this.processJillianLine(this.buffer);
            this.push(modifiedLine);
        }
        callback();
    }

    private processJillianLine(line: string): string {
        const trimmedLine = line.trim();

        // Skip empty lines and most comments
        if (trimmedLine === '' || (trimmedLine.startsWith('#') && !this.isJillianImportantTag(trimmedLine))) {
            return line;
        }

        // Handle URI attributes in tags
        if (trimmedLine.includes('URI=') && trimmedLine.includes('"')) {
            return this.processJillianUriLine(line);
        }

        // Handle non-comment lines (relative URLs that need to be converted to proxy URLs)
        if (!trimmedLine.startsWith('#') && trimmedLine.length > 0) {
            return this.processJillianUrlLine(trimmedLine);
        }

        return line;
    }

    private isJillianImportantTag(line: string): boolean {
        return line.includes('URI=');
    }

    private processJillianUrlLine(url: string): string {
        // For jilliandescribecompany.com, use the relative URL directly with base host
        const fullUrl = `${this.baseHost}/${url}`;
        return this.createJillianProxyUrl(fullUrl);
    }

    private processJillianUriLine(line: string): string {
        const uriMatch = line.match(/URI="([^"]+)"/);
        if (uriMatch && uriMatch[1]) {
            const relativeUrl = uriMatch[1];
            const fullUrl = `${this.baseHost}/${relativeUrl}`;
            const proxyUrl = this.createJillianProxyUrl(fullUrl);
            return line.replace(`URI="${relativeUrl}"`, `URI="${proxyUrl}"`);
        }
        return line;
    }

    private createJillianProxyUrl(url: string): string {
        const separator = this.originalHeaders ? '&' : '';
        
        // For jilliandescribecompany.com, use the URL directly without re-encoding
        return `/encoded-proxy?url=${encodeURIComponent(url)}${separator}${this.originalHeaders}`;
    }

    private generateJillianHash(url: string): string {
        return crypto.createHash('md5').update(url + Date.now().toString()).digest('hex').substring(0, 8);
    }
}

// Enhanced transform class for universal M3U8 processing
export class UniversalM3U8Transform extends Transform {
    private buffer: string;
    private baseUrl: string;
    private isMasterPlaylist: boolean = false;
    private originalHeaders: string;
    private playlistType: 'master' | 'media' | 'unknown' = 'unknown';

    constructor(baseUrl: string, originalHeaders?: string) {
        super();
        this.buffer = '';
        this.baseUrl = this.normalizeBaseUrl(baseUrl);
        this.originalHeaders = originalHeaders || '';
        console.log(`Universal M3U8 Transform: Base URL set to: ${this.baseUrl}`);
    }

    private normalizeBaseUrl(url: string): string {
        // Remove filename and keep directory path
        const normalized = url.replace(/[^\/]+$/, '');
        // Ensure it ends with a slash
        return normalized.endsWith('/') ? normalized : normalized + '/';
    }

    _transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
        const data = this.buffer + chunk.toString();
        const lines = data.split(/\r?\n/);
        this.buffer = lines.pop() || '';

        // Detect playlist type if not already determined
        if (this.playlistType === 'unknown') {
            this.detectPlaylistType(lines);
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

    private detectPlaylistType(lines: string[]) {
        const masterIndicators = [
            '#EXT-X-STREAM-INF:',
            '#EXT-X-I-FRAME-STREAM-INF:',
            '#EXT-X-MEDIA:',
            '#EXT-X-SESSION-DATA:',
            '#EXT-X-SESSION-KEY:'
        ];

        const mediaIndicators = [
            '#EXT-X-TARGETDURATION',
            '#EXT-X-MEDIA-SEQUENCE',
            '#EXTINF:',
            '#EXT-X-BYTERANGE:',
            '#EXT-X-DISCONTINUITY',
            '#EXT-X-ENDLIST'
        ];

        const hasMasterIndicators = lines.some(line => 
            masterIndicators.some(indicator => line.includes(indicator))
        );

        const hasMediaIndicators = lines.some(line => 
            mediaIndicators.some(indicator => line.includes(indicator))
        );

        if (hasMasterIndicators) {
            this.playlistType = 'master';
            this.isMasterPlaylist = true;
        } else if (hasMediaIndicators) {
            this.playlistType = 'media';
            this.isMasterPlaylist = false;
        }

    }

    private createProxyUrl(url: string): string {
        const separator = this.originalHeaders ? '&' : '';
        
        // Create base64 encoded payload for the URL
        const payload: DecodedPayload = {
            u: url,
            o: this.extractOriginFromHeaders(),
            r: this.extractRefererFromHeaders(),
            h: this.generateHash(url) // Add hash generation for consistency
        };

        const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64');
        return `/encoded-proxy?url=${encodeURIComponent(`https://proxy.domain.com/${encodedPayload}.m3u8`)}${separator}${this.originalHeaders}`;
    }

    private generateHash(url: string): string {
        // Generate a simple hash for the URL to maintain consistency
        return crypto.createHash('md5').update(url + Date.now().toString()).digest('hex').substring(0, 8);
    }

    private extractOriginFromHeaders(): string {
        // Extract origin from original headers if available
        const match = this.originalHeaders.match(/origin=([^&]+)/);
        return match ? decodeURIComponent(match[1]) : '';
    }

    private extractRefererFromHeaders(): string {
        // Extract referer from original headers if available
        const match = this.originalHeaders.match(/referer=([^&]+)/);
        return match ? decodeURIComponent(match[1]) : '';
    }

    private resolveUrl(path: string): string {
        if (path.startsWith('http://') || path.startsWith('https://')) {
            return path;
        }

        if (path.startsWith('//')) {
            // Protocol-relative URL
            const protocol = this.baseUrl.startsWith('https://') ? 'https:' : 'http:';
            return protocol + path;
        }

        if (path.startsWith('/')) {
            // Absolute path
            const urlParts = new URL(this.baseUrl);
            return `${urlParts.protocol}//${urlParts.host}${path}`;
        }

        if (path.startsWith('../')) {
            // Relative path going up directories
            const baseUrlWithoutProtocol = this.baseUrl.replace(/^https?:\/\//, '');
            const baseUrlParts = baseUrlWithoutProtocol.split('/').filter(part => part.length > 0);
            const pathParts = path.split('/').filter(part => part.length > 0);

            let upLevels = 0;
            for (const part of pathParts) {
                if (part === '..') {
                    upLevels++;
                } else {
                    break;
                }
            }

            const actualPathParts = pathParts.slice(upLevels);
            const actualBaseParts = baseUrlParts.slice(0, Math.max(0, baseUrlParts.length - upLevels));
            const resolvedPath = actualPathParts.join('/');
            const resolvedBase = actualBaseParts.join('/');

            const protocol = this.baseUrl.startsWith('https://') ? 'https://' : 'http://';
            return `${protocol}${resolvedBase}/${resolvedPath}`;
        }

        // Handle query parameters in relative paths
        if (path.includes('?')) {
            const [pathPart, queryPart] = path.split('?');
            const resolvedPath = this.baseUrl + pathPart;
            return `${resolvedPath}?${queryPart}`;
        }

        // Relative path
        return this.baseUrl + path;
    }

    private processLine(line: string): string {
        const trimmedLine = line.trim();

        // Skip empty lines and comments (except important ones)
        if (trimmedLine === '' || (trimmedLine.startsWith('#') && !this.isImportantTag(trimmedLine))) {
            return line;
        }

        // Handle encryption keys
        if (trimmedLine.includes('#EXT-X-KEY:') && trimmedLine.includes('URI=')) {
            return this.processKeyLine(line);
        }

        // Handle I-frame streams
        if (trimmedLine.includes('#EXT-X-I-FRAME-STREAM-INF') && trimmedLine.includes('URI=')) {
            return this.processIFrameLine(line);
        }

        // Handle media tracks (audio, subtitles, etc.)
        if (trimmedLine.includes('#EXT-X-MEDIA') && trimmedLine.includes('URI=')) {
            return this.processMediaLine(line);
        }

        // Handle session data
        if (trimmedLine.includes('#EXT-X-SESSION-DATA') && trimmedLine.includes('URI=')) {
            return this.processSessionDataLine(line);
        }

        // Handle session keys
        if (trimmedLine.includes('#EXT-X-SESSION-KEY') && trimmedLine.includes('URI=')) {
            return this.processSessionKeyLine(line);
        }

        // Handle non-comment lines (URLs)
        if (!trimmedLine.startsWith('#') && trimmedLine.length > 0) {
            return this.processUrlLine(trimmedLine);
        }

        return line;
    }

    private isImportantTag(line: string): boolean {
        const importantTags = [
            '#EXT-X-KEY:',
            '#EXT-X-MEDIA:',
            '#EXT-X-STREAM-INF:',
            '#EXT-X-I-FRAME-STREAM-INF:',
            '#EXT-X-SESSION-DATA:',
            '#EXT-X-SESSION-KEY:',
            '#EXT-X-MAP:'
        ];

        return importantTags.some(tag => line.includes(tag));
    }

    private processKeyLine(line: string): string {
        const uriMatch = line.match(/URI="([^"]+)"/);
        if (uriMatch && uriMatch[1]) {
            const keyPath = uriMatch[1];
            if (keyPath.includes('/encoded-proxy?url=')) {
                return line;
            }

            const keyUrl = this.resolveUrl(keyPath);
            console.log(`Universal M3U8 Transform: Proxying key: ${keyPath} → ${keyUrl}`);
            return line.replace(`URI="${keyPath}"`, `URI="${this.createProxyUrl(keyUrl)}"`);
        }
        return line;
    }

    private processIFrameLine(line: string): string {
        const uriMatch = line.match(/URI="([^"]+)"/);
        if (uriMatch && uriMatch[1]) {
            const iframePath = uriMatch[1];
            if (iframePath.includes('/encoded-proxy?url=')) {
                return line;
            }

            const iframeUrl = this.resolveUrl(iframePath);
            console.log(`Universal M3U8 Transform: Proxying I-frame: ${iframePath} → ${iframeUrl}`);
            return line.replace(`URI="${iframePath}"`, `URI="${this.createProxyUrl(iframeUrl)}"`);
        }
        return line;
    }

    private processMediaLine(line: string): string {
        const uriMatch = line.match(/URI="([^"]+)"/);
        if (uriMatch && uriMatch[1]) {
            const mediaPath = uriMatch[1];
            if (mediaPath.includes('/encoded-proxy?url=')) {
                return line;
            }

            const mediaUrl = this.resolveUrl(mediaPath);
            console.log(`Universal M3U8 Transform: Proxying media: ${mediaPath} → ${mediaUrl}`);
            return line.replace(`URI="${mediaPath}"`, `URI="${this.createProxyUrl(mediaUrl)}"`);
        }
        return line;
    }

    private processSessionDataLine(line: string): string {
        const uriMatch = line.match(/URI="([^"]+)"/);
        if (uriMatch && uriMatch[1]) {
            const sessionPath = uriMatch[1];
            if (sessionPath.includes('/encoded-proxy?url=')) {
                return line;
            }

            const sessionUrl = this.resolveUrl(sessionPath);
            console.log(`Universal M3U8 Transform: Proxying session data: ${sessionPath} → ${sessionUrl}`);
            return line.replace(`URI="${sessionPath}"`, `URI="${this.createProxyUrl(sessionUrl)}"`);
        }
        return line;
    }

    private processSessionKeyLine(line: string): string {
        const uriMatch = line.match(/URI="([^"]+)"/);
        if (uriMatch && uriMatch[1]) {
            const keyPath = uriMatch[1];
            if (keyPath.includes('/encoded-proxy?url=')) {
                return line;
            }

            const keyUrl = this.resolveUrl(keyPath);
            console.log(`Universal M3U8 Transform: Proxying session key: ${keyPath} → ${keyUrl}`);
            return line.replace(`URI="${keyPath}"`, `URI="${this.createProxyUrl(keyUrl)}"`);
        }
        return line;
    }

    private processUrlLine(url: string): string {
        if (url.includes('/encoded-proxy?url=')) {
            return url;
        }

        const resolvedUrl = this.resolveUrl(url);

        // Enhanced logic for determining what should be proxied
        const shouldProxy = this.shouldProxyUrl(url, resolvedUrl);

        if (shouldProxy) {
            return this.createProxyUrl(resolvedUrl);
        }

        return url;
    }

    private shouldProxyUrl(originalUrl: string, resolvedUrl: string): boolean {
        // Always proxy M3U8 files
        if (originalUrl.includes('.m3u8') || originalUrl.includes('.m3u')) {
            return true;
        }

        // For master playlists, proxy streaming-related files
        if (this.isMasterPlaylist) {
            return originalUrl.includes('.m3u8') || originalUrl.includes('.m3u');
        }

        // For media playlists, proxy segments and related files
        const segmentExtensions = ['.ts', '.m4s', '.mp4', '.webm', '.mkv'];
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
        const subtitleExtensions = ['.vtt', '.srt', '.ass', '.ttml'];
        const keyExtensions = ['.key'];

        const allProxyExtensions = [
            ...segmentExtensions,
            ...imageExtensions, 
            ...subtitleExtensions,
            ...keyExtensions
        ];

        // Check if URL ends with any proxy-worthy extension
        const hasProxyExtension = allProxyExtensions.some(ext => 
            originalUrl.toLowerCase().endsWith(ext) || 
            originalUrl.toLowerCase().includes(ext + '?')
        );

        // Also check for common segment patterns
        const hasSegmentPattern = /seg-\d+|segment\d+|chunk\d+|frag\d+|image\d+/.test(originalUrl);

        return hasProxyExtension || hasSegmentPattern;
    }
}

// Enhanced proxy handler
export const ultimateNeoProxy = async (req: Request, res: Response) => {
    // Enhanced CORS configuration
    const allowedOrigins = [
        'https://cinemaos.live',
        'https://www.cinemaos.live',
        'http://localhost:3000',
        'http://localhost:3001',
        'https://if9.ppzj-youtube.cfd',
        'https://gstream.hollymoviehed.cc',
        'https://cinemaos-v3.netlify.app',
        'https://cinemaos-v3.vercel.app',
        'https://ridomovies.tv',
        'https://jilliandescribecompany.com',
        'https://hollymoviehdcdn05.site',
        'https://gstream.hollymoviehd.cc',
        'https://feltrixfire11.xyz',
        'https://orbitcache.com',
        '*' // Allow all origins as fallback
    ];

    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    } else {
        res.header('Access-Control-Allow-Origin', '*');
    }
    
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Referer, User-Agent, Authorization, Range');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const encodedUrl = req.query.url as string;
        if (!encodedUrl) {
            return res.status(400).json({ error: "url parameter is required" });
        }

        console.log("Universal Proxy: Processing URL:", encodedUrl);
        console.log("Universal Proxy: Request Origin:", req.headers.origin);

        let decodedPayload: DecodedPayload;
        let targetUrl: string;

        // Try to decode as base64 encoded URL first
        const base64Match = encodedUrl.match(/^https?:\/\/[^\/]+\/([^.]+)\.m3u8$/);
        if (base64Match) {
            const base64Payload = base64Match[1];
            try {
                const decodedString = Buffer.from(base64Payload, 'base64').toString('utf-8');
                decodedPayload = JSON.parse(decodedString);
                targetUrl = decodedPayload.u;
                console.log("Decoded payload:", decodedPayload);
            } catch (decodeError) {
                console.error("Failed to decode payload:", decodeError);
                return res.status(400).json({ error: "Invalid base64 or JSON payload" });
            }
        } else {
            // Direct URL - create a basic payload
            targetUrl = encodedUrl;
            decodedPayload = {
                u: targetUrl,
                o: req.query.origin as string || req.headers.origin,
                r: req.query.referer as string || req.headers.referer
            };
        }

        if (!targetUrl) {
            return res.status(400).json({ error: "No valid URL found" });
        }

        if(decodedPayload.o?.includes("https://jilliandescribecompany.com")) {
            targetUrl = encodedUrl
        }

        const baseUrl = targetUrl.replace(/[^/]+$/, "");
        const isStaticFile = allowedExtensions.some(ext => targetUrl.endsWith(ext));
        
        console.log("Target URL:", targetUrl);
        console.log("Base URL:", baseUrl);

        const isRidomoviesTextRequest = decodedPayload.o?.includes('ridomovies.tv') && 
                                       (targetUrl.includes('/txt/') || targetUrl.endsWith('.txt'));

        const isJillianDescribeRequest = decodedPayload.o?.includes('https://jilliandescribecompany.com');

        const isIf9YoutubeRequest = decodedPayload.o?.includes('https://if9.ppzj-youtube.cfd');


        // Build headers query string for subsequent requests
        const buildHeadersQuery = () => {
            const headerParams: string[] = [];

            const referer = req.query.referer as string || decodedPayload.r;
            const userAgent = req.query.userAgent as string || decodedPayload.ua;
            const origin = req.query.origin as string || decodedPayload.o;
            const hash = req.query.hash as string || decodedPayload.h;

            if (referer) headerParams.push(`referer=${encodeURIComponent(referer)}`);
            if (userAgent) headerParams.push(`userAgent=${encodeURIComponent(userAgent)}`);
            if (origin) headerParams.push(`origin=${encodeURIComponent(origin)}`);
            if (hash) headerParams.push(`hash=${encodeURIComponent(hash)}`);

            // Add custom headers from query
            Object.keys(req.query).forEach(key => {
                if (key.startsWith('header-')) {
                    headerParams.push(`${key}=${encodeURIComponent(req.query[key] as string)}`);
                }
            });

            return headerParams.join('&');
        };

        const originalHeadersQuery = buildHeadersQuery();

        // Enhanced user agent rotation with more realistic agents
        const getRandomUserAgent = () => {
            const userAgents = [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
                'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1',
                'Mozilla/5.0 (iPad; CPU OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1'
            ];
            return userAgents[Math.floor(Math.random() * userAgents.length)];
        };

        // Build comprehensive request headers
        const customReferer = req.query.referer as string || decodedPayload.r || req.headers.referer || targetUrl;
        const customUserAgent = req.query.userAgent as string || decodedPayload.ua || req.headers['user-agent'] || getRandomUserAgent();
        const customOrigin = req.query.origin as string || decodedPayload.o || req.headers.origin || customReferer;

        console.log("Universal Proxy: Using Referer:", customReferer);
        console.log("Universal Proxy: Using User-Agent:", customUserAgent);
        console.log("Universal Proxy: Using Origin:", customOrigin);

        // Enhanced request headers with better fingerprinting
        const requestHeaders: any = {
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'DNT': '1',
            'Sec-Ch-Ua': '"Chromium";v="121", "Not A(Brand";v="99"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site',
            'Upgrade-Insecure-Requests': '1',
            'Referer': customReferer.includes("ridomovies.tv") ? "https://closeload.top/" : customReferer,
            'Origin': customOrigin.includes("ridomovies.tv") ? "https://closeload.top" : customOrigin,
            'User-Agent': customUserAgent
        };

        // Handle Range requests for video segments
        if (req.headers.range) {
            requestHeaders['Range'] = req.headers.range;
        }

        // Add custom headers from decoded payload
        if (decodedPayload.h) {
            requestHeaders['X-Custom-Hash'] = decodedPayload.h;
        }

        // Add custom headers from query parameters
        Object.keys(req.query).forEach(key => {
            if (key.startsWith('header-')) {
                const headerName = key.replace('header-', '');
                requestHeaders[headerName] = req.query[key] as string;
            }
        });

        // Remove potentially problematic headers
        delete requestHeaders['CF-Ray'];
        delete requestHeaders['CF-Visitor'];
        delete requestHeaders['CF-Connecting-IP'];
        delete requestHeaders['X-Forwarded-For'];
        delete requestHeaders['X-Forwarded-Proto'];
        delete requestHeaders['X-Vercel-Id'];
        delete requestHeaders['X-Real-IP'];

        const response = await axios.get(targetUrl, {
            responseType: 'stream',
            headers: decodedPayload.o?.includes("https://jilliandescribecompany.com") ? {} : requestHeaders,
            maxRedirects: 10,
            timeout: 30000,
            validateStatus: (status) => status >= 200 && status < 400
        });

        const headers = { ...response.headers };

        // Clean response headers
        delete headers['content-length'];
        delete headers['content-encoding'];
        delete headers['transfer-encoding'];
        delete headers['connection'];

        if (isRidomoviesTextRequest) {
            console.log("Universal Proxy: Handling ridomovies.tv text format as M3U8");
            
            // Force M3U8 content type
            headers['Content-Type'] = 'application/vnd.apple.mpegurl; charset=UTF-8';
            
            // Ensure CORS headers
            headers['Access-Control-Allow-Origin'] = req.headers.origin && allowedOrigins.includes(req.headers.origin) 
                ? req.headers.origin 
                : '*';
            headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
            headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Referer, User-Agent, Authorization, Range';

            res.set(headers);

            // Transform the text content as M3U8
            const transform = new UniversalM3U8Transform(baseUrl, originalHeadersQuery);
            response.data.pipe(transform).pipe(res);
            return;
        }

        if (isJillianDescribeRequest) {
            console.log("Universal Proxy: Handling jilliandescribecompany.com M3U8 format");
            
            // Force M3U8 content type
            headers['Content-Type'] = 'application/vnd.apple.mpegurl; charset=UTF-8';
            
            // Ensure CORS headers
            headers['Access-Control-Allow-Origin'] = req.headers.origin && allowedOrigins.includes(req.headers.origin) 
                ? req.headers.origin 
                : '*';
            headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
            headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Referer, User-Agent, Authorization, Range';

            res.set(headers);

            // Transform the content with special handling for jilliandescribecompany.com
            const transform = new JillianDescribeM3U8Transform(targetUrl, originalHeadersQuery);
            response.data.pipe(transform).pipe(res);
            return;
        }

        if (isIf9YoutubeRequest) {
            console.log("Universal Proxy: Handling if9.ppzj-youtube.cfd request");
            
            // Only force M3U8 content type for actual M3U8 files
            const isActualM3U8 = targetUrl.includes('.m3u8') || 
                                targetUrl.includes('.m3u') || 
                                headers['content-type']?.includes('mpegurl') ||
                                headers['content-type']?.includes('application/vnd.apple.mpegurl');

            if (isActualM3U8) {
                console.log("Universal Proxy: Handling if9.ppzj-youtube.cfd M3U8 format");
                
                // Force M3U8 content type only for M3U8 files
                headers['Content-Type'] = 'application/vnd.apple.mpegurl; charset=UTF-8';
                
                // Ensure CORS headers
                headers['Access-Control-Allow-Origin'] = req.headers.origin && allowedOrigins.includes(req.headers.origin) 
                    ? req.headers.origin 
                    : '*';
                headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
                headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Referer, User-Agent, Authorization, Range';

                res.set(headers);

                // Transform the content with special handling for if9.ppzj-youtube.cfd
                const transform = new If9YoutubeM3U8Transform(targetUrl, originalHeadersQuery);
                response.data.pipe(transform).pipe(res);
                return;
            } else {
                console.log("Universal Proxy: Handling if9.ppzj-youtube.cfd non-M3U8 file (keeping original content type)");
                
                // For non-M3U8 files, keep the original content type and just add CORS headers
                headers['Access-Control-Allow-Origin'] = req.headers.origin && allowedOrigins.includes(req.headers.origin) 
                    ? req.headers.origin 
                    : '*';
                headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
                headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Referer, User-Agent, Authorization, Range';

                res.set(headers);

                // Pipe the content directly without transformation
                response.data.pipe(res);
                return;
            }
        }

        // Handle different content types more precisely
        const fileExtension = targetUrl.split('.').pop()?.toLowerCase().split('?')[0]; // Remove query params
        const contentTypeMap: { [key: string]: string } = {
            'm3u8': 'application/vnd.apple.mpegurl; charset=UTF-8',
            'm3u': 'application/vnd.apple.mpegurl; charset=UTF-8',
            'ts': 'video/mp2t',
            'm4s': 'video/iso.segment',
            'mp4': 'video/mp4',
            'webm': 'video/webm',
            'mkv': 'video/x-matroska',
            'avi': 'video/x-msvideo',
            'mov': 'video/quicktime',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'webp': 'image/webp',
            'gif': 'image/gif',
            'ico': 'image/x-icon',
            'svg': 'image/svg+xml',
            'vtt': 'text/vtt; charset=UTF-8',
            'srt': 'text/plain; charset=UTF-8',
            'ass': 'text/plain; charset=UTF-8',
            'ttml': 'application/ttml+xml',
            'dfxp': 'application/ttaf+xml',
            'key': 'application/octet-stream',
            'json': 'application/json',
            'xml': 'application/xml',
            'txt': 'text/plain; charset=UTF-8'
        };

        if (fileExtension && contentTypeMap[fileExtension]) {
            headers['Content-Type'] = contentTypeMap[fileExtension];
        }

        // Ensure CORS headers
        headers['Access-Control-Allow-Origin'] = req.headers.origin && allowedOrigins.includes(req.headers.origin) 
            ? req.headers.origin 
            : '*';
        headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Referer, User-Agent, Authorization, Range';

        res.set(headers);

        // Handle different file types with better logic
        if (isStaticFile && !targetUrl.includes('.m3u8') && !targetUrl.includes('.m3u')) {
            console.log(`Universal Proxy: Piping static file: ${targetUrl.split('/').pop()}`);
            return response.data.pipe(res);
        }

        // Transform M3U8 playlists with enhanced detection
        const isPlaylist = targetUrl.includes('.m3u8') || 
                          targetUrl.includes('.m3u') || 
                          headers['content-type']?.includes('mpegurl') ||
                          headers['content-type']?.includes('application/vnd.apple.mpegurl');

        if (isPlaylist) {
            console.log(`Universal Proxy: Transforming M3U8: ${targetUrl.split('/').pop()}`);
            const transform = new UniversalM3U8Transform(baseUrl, originalHeadersQuery);
            response.data.pipe(transform).pipe(res);
        } else {
            // Pipe other content directly
            console.log(`Universal Proxy: Piping content: ${targetUrl.split('/').pop()}`);
            response.data.pipe(res);
        }

    } catch (error: any) {
        console.error("Universal proxy error:", {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            url: req.query.url,
            origin: req.headers.origin
        });

        // Ensure CORS headers on error
        const origin = req.headers.origin;
        const allowedOrigins = ['https://cinemaos.live', 'https://www.cinemaos.live', '*'];
        
        if (origin && allowedOrigins.includes(origin)) {
            res.header('Access-Control-Allow-Origin', origin);
        } else {
            res.header('Access-Control-Allow-Origin', '*');
        }

        res.status(error.response?.status || 500).json({
            error: `Universal proxy error: ${error.message}`,
            status: error.response?.status || 'unknown'
        });
    }
};