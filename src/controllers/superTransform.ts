import axios from "axios";
import { Request, Response } from "express";
import { Transform, TransformCallback } from 'stream';
import { createObfuscatedUrl } from './obfuscatedUrl';

const PROXY_BASE_URL = process.env.PROXY_BASE_URL || 'http://localhost:4004';

export class M3U8Transform extends Transform {
    private buffer: string;
    private baseUrl: string;
    private proxyBaseUrl: string;
    private originalUrl: string;

    constructor(originalUrl: string, proxyBaseUrl: string) {
        super();
        this.buffer = '';
        this.baseUrl = this.extractBaseUrl(originalUrl);
        this.proxyBaseUrl = proxyBaseUrl;
        this.originalUrl = originalUrl;
        console.log(`Super Transform: M3U8Transform constructor called`);
        console.log(`Super Transform: Original URL: ${originalUrl}`);
        console.log(`Super Transform: Extracted base URL: ${this.baseUrl}`);
        console.log(`Super Transform: Proxy base URL: ${this.proxyBaseUrl}`);
    }

    private extractBaseUrl(url: string): string {
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/');
            pathParts.pop(); // Remove the filename
            urlObj.pathname = pathParts.join('/') + '/';
            const result = urlObj.toString();
            console.log(`Super Transform: Extracted base URL from "${url}" to "${result}"`);
            return result;
        } catch (error) {
            // Fallback for malformed URLs
            const urlParts = url.split('/');
            urlParts.pop(); // Remove the filename
            const result = urlParts.join('/') + '/';
            console.log(`Super Transform: Fallback extraction from "${url}" to "${result}"`);
            return result;
        }
    }

    _transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
        const data = this.buffer + chunk.toString();
        const lines = data.split(/\r?\n/);
        this.buffer = lines.pop() || '';

        console.log(`Super Transform: Processing ${lines.length} lines`);
        console.log(`Super Transform: Chunk data: "${data.substring(0, 200)}..."`);
        
        for (const line of lines) {
            console.log(`Super Transform: Processing line: "${line}"`);
            const processedLine = this.processLine(line);
            console.log(`Super Transform: Processed line: "${processedLine}"`);
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
            console.log(`Super Transform: Processing URL line: "${trimmedLine}"`);
            const result = this.createProxyUrl(trimmedLine);
            console.log(`Super Transform: Result: "${result}"`);
            return result;
        }

        return line;
    }

    private isUrl(line: string): boolean {
        // A line is a URL if it:
        // 1. Starts with http:// or https:// (absolute URLs)
        // 2. Starts with / (absolute paths on same domain)
        // 3. Is not empty and doesn't start with # (relative paths)
        const isUrl = line.startsWith('http://') || 
                     line.startsWith('https://') || 
                     line.startsWith('/') ||
                     (!line.startsWith('#') && line.length > 0);
        console.log(`Super Transform: isUrl check for "${line}" = ${isUrl} (starts with /: ${line.startsWith('/')}, length: ${line.length})`);
        
        // Special debug for segment lines
        if (line.startsWith('/file')) {
            console.log(`Super Transform: Found segment line: "${line}"`);
        }
        
        return isUrl;
    }

    private createProxyUrl(url: string): string {
        let targetUrl = url;
        
        // Handle relative URLs
        if (!url.startsWith('http')) {
            // If it starts with /, it's an absolute path on the same domain
            if (url.startsWith('/')) {
                try {
                    // Use the original domain from the originalUrl, not from baseUrl
                    // baseUrl may include extra path segments if the m3u8 is nested
                    const originalUrlObj = new URL(this.originalUrl);
                    targetUrl = `${originalUrlObj.protocol}//${originalUrlObj.host}${url}`;
                    console.log(`Super Transform: [FIXED] Converted absolute path "${url}" to "${targetUrl}" using original domain "${originalUrlObj.host}"`);
                } catch (error) {
                    targetUrl = this.baseUrl + url;
                    console.log(`Super Transform: Fallback conversion of "${url}" to "${targetUrl}"`);
                }
            } else {
                // It's a relative path
                targetUrl = this.baseUrl + url;
                console.log(`Super Transform: Converted relative path "${url}" to "${targetUrl}"`);
            }
        } else {
            console.log(`Super Transform: URL "${url}" is already absolute`);
        }

        // Create obfuscated URL instead of direct proxy URL
        const obfuscatedUrl = this.createObfuscatedUrl(targetUrl);
        console.log(`Super Transform: Final obfuscated URL: ${obfuscatedUrl}`);
        return obfuscatedUrl;
    }

    private createObfuscatedUrl(targetUrl: string): string {
        const obfuscatedId = createObfuscatedUrl(targetUrl);
        const baseUrl = process.env.PROXY_BASE_URL || 'http://localhost:4004';
        return `${baseUrl}/p/${obfuscatedId}`;
    }

    // Add a test method to verify the transformation logic
    public static testTransformation() {
        const testUrl = "https://hexawave3.xyz/file2/test/index.m3u8";
        const proxyBaseUrl = "http://localhost:4004";
        const transform = new M3U8Transform(testUrl, proxyBaseUrl);
        
        const testSegment = "/file2/test/segment.ts";
        const result = transform.createProxyUrl(testSegment);
        console.log(`Test transformation: "${testSegment}" -> "${result}"`);
        
        // Test with the actual segment format
        const actualSegment = "/file2/6BKqV7gYuve6zOUPVjRzxBIpPqkhTyf6p94IP4oqJvRUNC9gvb~kZIbIxqC47rpIj74oCZvJkkJYAC3D2RDyoBQPFIq5bXXaaTpf7h5Jc4scGMqlrSLFN6M~ik3oava4BHICyVWKIxyzb89c5tdeUtdmw33M4DQzQYHyMehDQww=/MTA4MA==/c2VnLTEtdjEtYTEuanBn";
        const actualResult = transform.createProxyUrl(actualSegment);
        console.log(`Actual segment transformation: "${actualSegment}" -> "${actualResult}"`);
        
        return result;
    }
}

export const superTransform = async (req: Request, res: Response) => {
    console.log("=== SUPER TRANSFORM FUNCTION CALLED ===");
    console.log("Super Transform: Request URL:", req.url);
    console.log("Super Transform: Query params:", req.query);
    
    // Test the transformation logic
    M3U8Transform.testTransformation();
    
    // Check if this is a test request
    if (req.query.test === 'true') {
        console.log("Super Transform: Test request detected");
        return res.json({
            message: "Super Transform is working",
            test: M3U8Transform.testTransformation(),
            proxyBaseUrl: PROXY_BASE_URL
        });
    }
    
    // Check if this is a simple ping test
    if (req.query.ping === 'true') {
        console.log("Super Transform: Ping request detected");
        return res.json({
            message: "Super Transform endpoint is reachable",
            timestamp: new Date().toISOString()
        });
    }
    
    // Set CORS headers immediately
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS, HEAD');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Referer, User-Agent, Range');
    res.header('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range, Content-Type');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        let url = req.query.url as string;
        const referer = req.query.referer as string || 'https://hexa.watch/';
        
        if (!url) return res.status(400).json("url is required");
        
        // Fix URL encoding issues - restore + characters that were converted to spaces
        url = url.replace(/\s/g, '+');
        
        console.log("Super Transform: Original URL from query:", req.query.url);
        console.log("Super Transform: Fixed URL:", url);

        console.log("Super Transform: Processing URL:", url);
        console.log("Super Transform: Using Referer:", referer);

        // Build request headers
        const requestHeaders: any = {
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Ch-Ua': '"Google Chrome";v="123", "Chromium";v="123", "Not?A_Brand";v="24"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"macOS"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
        };
        
        // Only add referer and origin if URL doesn't contain "brunelwave"
        if (!url.includes('brunelwave')) {
            requestHeaders['Referer'] = referer;
            requestHeaders['Origin'] = referer.replace(/\/$/, ''); // Remove trailing slash
        }

        // Forward Range header if present (for partial content requests)
        if (req.headers.range) {
            requestHeaders['Range'] = req.headers.range;
        }

        const response = await axios.get(url, {
            responseType: 'stream',
            headers: requestHeaders,
            maxRedirects: 5,
            timeout: 30000,
            validateStatus: function (status) {
                return status < 400;
            }
        });

        // Determine content type based on file extension
        let contentType = 'application/octet-stream';
        if (url.includes('.ts')) {
            contentType = 'video/mp2t'; // MPEG-2 Transport Stream
        } else if (url.includes('.m4s')) {
            contentType = 'video/mp4';
        } else if (url.includes('.mp4')) {
            contentType = 'video/mp4';
        } else if (url.includes('.webm')) {
            contentType = 'video/webm';
        } else if (url.includes('.m3u8')) {
            contentType = 'application/vnd.apple.mpegurl';
        }

        // Set headers for video segment/file
        const segmentHeaders: any = {
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range, Content-Type',
            'X-Content-Type-Options': 'nosniff'
        };

        // Include content length if available
        if (response.headers['content-length']) {
            segmentHeaders['Content-Length'] = response.headers['content-length'];
        }

        // Include content range for partial content
        if (response.headers['content-range']) {
            segmentHeaders['Content-Range'] = response.headers['content-range'];
        }

        // Include ETag for caching
        if (response.headers['etag']) {
            segmentHeaders['ETag'] = response.headers['etag'];
        }

        // Include Last-Modified for caching
        if (response.headers['last-modified']) {
            segmentHeaders['Last-Modified'] = response.headers['last-modified'];
        }

        // Set cache control based on content type
        if (contentType.includes('video/')) {
            segmentHeaders['Cache-Control'] = 'public, max-age=3600'; // Cache video segments for 1 hour
        } else {
            segmentHeaders['Cache-Control'] = 'no-cache';
        }

        // Set the status code and headers
        res.status(response.status);
        res.set(segmentHeaders);

        console.log(`Super Transform: Streaming content from: ${url} (Status: ${response.status}, Type: ${contentType})`);
        
        // Check if it's an M3U8 file
        const isM3U8 = url.includes('.m3u8') || 
                       url.includes('.m3u') ||
                       response.headers['content-type']?.includes('mpegurl') ||
                       response.headers['content-type']?.includes('application/vnd.apple.mpegurl');

        console.log(`Super Transform: M3U8 detection - URL: ${url}, isM3U8: ${isM3U8}, content-type: ${response.headers['content-type']}`);
        console.log(`Super Transform: URL contains .m3u8: ${url.includes('.m3u8')}`);
        console.log(`Super Transform: URL contains .m3u: ${url.includes('.m3u')}`);

        if (isM3U8) {
            console.log("Super Transform: Transforming M3U8 content");
            console.log(`Super Transform: Using PROXY_BASE_URL: ${PROXY_BASE_URL}`);
            // Set proper content type for M3U8
            res.set('Content-Type', 'application/vnd.apple.mpegurl; charset=UTF-8');
            
            // Transform the M3U8 content
            const transform = new M3U8Transform(url, PROXY_BASE_URL);
            console.log("Super Transform: Created M3U8Transform instance");
            response.data.pipe(transform).pipe(res);
        } else {
            console.log("Super Transform: Not an M3U8 file, piping directly");
            // Pipe the content stream directly to response for non-M3U8 files
            response.data.pipe(res);
        }

        // Handle stream errors
        response.data.on('error', (error: any) => {
            console.error('Super Transform: Stream error:', error);
            if (!res.headersSent) {
                res.status(500).send('Stream error occurred');
            }
        });

        // Handle response finish
        res.on('finish', () => {
            console.log(`Super Transform: Successfully streamed content from: ${url}`);
        });

    } catch (error: any) {
        console.error("Super Transform error:", {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            url: req.query.url,
            referer: req.query.referer
        });

        if (!res.headersSent) {
            res.status(error.response?.status || 500).send(
                `Error: ${error.message}. Status: ${error.response?.status || 'unknown'}`
            );
        }
    }
};