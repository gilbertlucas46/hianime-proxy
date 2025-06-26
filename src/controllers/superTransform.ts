import axios from "axios";
import { Request, Response } from "express";

export const superTransform = async (req: Request, res: Response) => {
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
        const url = req.query.url as string;
        const referer = req.query.referer as string || 'https://hexa.watch/';
        
        if (!url) return res.status(400).json("url is required");

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
        
        // Pipe the content stream directly to response
        response.data.pipe(res);

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