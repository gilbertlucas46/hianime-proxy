import axios from "axios";
import { Request, Response } from "express";
import { Transform, TransformCallback } from 'stream';

export class M3U8Transform extends Transform {
    private buffer: string;
    private baseUrl: string;
    private proxyBaseUrl: string;

    constructor(originalUrl: string, proxyBaseUrl: string = '') {
        super();
        this.buffer = '';
        this.baseUrl = this.extractBaseUrl(originalUrl);
        this.proxyBaseUrl = proxyBaseUrl;
    }

    private extractBaseUrl(url: string): string {
        const urlParts = url.split('/');
        urlParts.pop(); // Remove the filename
        return urlParts.join('/') + '/';
    }

    _transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
        const data = this.buffer + chunk.toString();
        const lines = data.split(/\r?\n/);
        this.buffer = lines.pop() || '';

        for (const line of lines) {
            const processedLine = this.processLine(line);
            this.push(processedLine + '\n');
        }

        callback();
    }

    _flush(callback: TransformCallback) {
        if (this.buffer) {
            const processedLine = this.processLine(this.buffer);
            this.push(processedLine);
        }
        callback();
    }

    private processLine(line: string): string {
        const trimmedLine = line.trim();

        // Skip empty lines and comments
        if (trimmedLine === '' || trimmedLine.startsWith('#')) {
            return line;
        }

        // Process URLs
        if (this.isUrl(trimmedLine)) {
            return this.createProxyUrl(trimmedLine);
        }

        return line;
    }

    private isUrl(line: string): boolean {
        return line.startsWith('http://') || line.startsWith('https://') || 
               (!line.startsWith('#') && line.length > 0);
    }

    private createProxyUrl(url: string): string {
        let targetUrl = url;
        
        // Handle relative URLs
        if (!url.startsWith('http')) {
            targetUrl = this.baseUrl + url;
        }

        // Create proxy URL
        return `/tom-proxy?url=${encodeURIComponent(targetUrl)}`;
    }
}

export const tomProxy = async (req: Request, res: Response) => {
    // CORS headers
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Referer, User-Agent, Authorization, Range');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const targetUrl = req.query.url as string;
        if (!targetUrl) {
            return res.status(400).json({ error: "url parameter is required" });
        }

        console.log("Tom Proxy: Processing URL:", targetUrl);

        // Request headers
        const requestHeaders: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
        };

        // Only add referer and origin if host is not brunelwave.pro
        if (!targetUrl.includes('brunelwave.pro')) {
            requestHeaders['Referer'] = "https://autoembed.cc/";
            requestHeaders['Origin'] = "https://autoembed.cc";
        }

        // Handle Range requests
        if (req.headers.range) {
            requestHeaders['Range'] = req.headers.range;
        }

        const response = await axios.get(targetUrl, {
            responseType: 'stream',
            headers: requestHeaders,
            timeout: 30000,
            maxRedirects: 10,
            validateStatus: (status) => status >= 200 && status < 400
        });

        // Set response headers
        const headers = { ...response.headers };
        delete headers['content-length'];
        delete headers['content-encoding'];
        delete headers['transfer-encoding'];
        delete headers['connection'];

        // Add CORS headers
        headers['Access-Control-Allow-Origin'] = '*';
        headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Referer, User-Agent, Authorization, Range';

        // Determine file type from URL and set appropriate content type
        const fileExtension = targetUrl.split('.').pop()?.toLowerCase().split('?')[0]; // Remove query params
        const contentTypeMap: { [key: string]: string } = {
            // M3U8 files
            'm3u8': 'application/vnd.apple.mpegurl; charset=UTF-8',
            'm3u': 'application/vnd.apple.mpegurl; charset=UTF-8',
            
            // Video files
            'ts': 'video/mp2t',
            'm4s': 'video/iso.segment',
            'mp4': 'video/mp4',
            'webm': 'video/webm',
            'mkv': 'video/x-matroska',
            'avi': 'video/x-msvideo',
            'mov': 'video/quicktime',
            
            // Image files
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'webp': 'image/webp',
            'gif': 'image/gif',
            'ico': 'image/x-icon',
            'svg': 'image/svg+xml',
            'bmp': 'image/bmp',
            'tiff': 'image/tiff',
            'tif': 'image/tiff',
            
            // Subtitle files
            'vtt': 'text/vtt; charset=UTF-8',
            'srt': 'text/plain; charset=UTF-8',
            'ass': 'text/plain; charset=UTF-8',
            'ttml': 'application/ttml+xml',
            'dfxp': 'application/ttaf+xml',
            
            // Other files
            'key': 'application/octet-stream',
            'json': 'application/json',
            'xml': 'application/xml',
            'txt': 'text/plain; charset=UTF-8'
        };

        // Set content type based on file extension or response headers
        if (fileExtension && contentTypeMap[fileExtension]) {
            headers['Content-Type'] = contentTypeMap[fileExtension];
            console.log(`Tom Proxy: Set content type to ${contentTypeMap[fileExtension]} for .${fileExtension} file`);
        }

        res.set(headers);

        // Check if it's an M3U8 file
        const isM3U8 = targetUrl.includes('.m3u8') || 
                       targetUrl.includes('.m3u') ||
                       headers['content-type']?.includes('mpegurl') ||
                       headers['content-type']?.includes('application/vnd.apple.mpegurl');

        if (isM3U8) {
            console.log("Tom Proxy: Transforming M3U8 content");
            // Set proper content type for M3U8
            res.set('Content-Type', 'application/vnd.apple.mpegurl; charset=UTF-8');
            
            // Transform the M3U8 content
            const transform = new M3U8Transform(targetUrl);
            response.data.pipe(transform).pipe(res);
        } else {
            console.log(`Tom Proxy: Piping ${fileExtension || 'unknown'} file directly`);
            // For other files (segments, images, etc.), pipe directly
            res.set('Content-Type', 'image/png'); // Default to binary stream
            response.data.pipe(res);
        }

    } catch (error: any) {
        console.error("Tom proxy error:", {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            url: req.query.url
        });

        res.header('Access-Control-Allow-Origin', '*');
        res.status(error.response?.status || 500).json({
            error: `Tom proxy error: ${error.message}`,
            status: error.response?.status || 'unknown'
        });
    }
};