import axios from "axios";
import { Request, Response } from "express";

// Connection pool for reusing HTTP connections
const axiosInstance = axios.create({
    timeout: 60000, // Increased timeout for large files
    maxRedirects: 3, // Reduced redirects
    // Enable HTTP keep-alive for connection reuse
    httpAgent: new (require('http').Agent)({ 
        keepAlive: true, 
        maxSockets: 50,
        maxFreeSockets: 10,
        timeout: 60000,
        freeSocketTimeout: 30000
    }),
    httpsAgent: new (require('https').Agent)({ 
        keepAlive: true, 
        maxSockets: 50,
        maxFreeSockets: 10,
        timeout: 60000,
        freeSocketTimeout: 30000
    })
});

export const mp4Proxy = async (req: Request, res: Response) => {
    // Set CORS headers immediately
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS, HEAD');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Referer, User-Agent, Range');
    res.header('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag, Cache-Control');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Handle HEAD requests for metadata
    if (req.method === 'HEAD') {
        try {
            const url = req.query.url as string;
            if (!url) return res.status(400).json("url is required");

            const headResponse = await axiosInstance.head(url, {
                headers: getRequestHeaders(req),
                timeout: 10000 // Shorter timeout for HEAD requests
            });

            // Copy relevant headers
            const headers = getStreamingHeaders(headResponse.headers);
            res.status(headResponse.status).set(headers).end();
        } catch (error: any) {
            res.status(error.response?.status || 500).end();
        }
        return;
    }

    try {
        const url = req.query.url as string;
        const referer = req.query.referer as string || 'https://animetsu.cc/';
        const origin = req.query.origin as string || 'https://animetsu.cc/';
        if (!url) return res.status(400).json("url is required");

        console.log("Animetsu: Processing URL:", url);

        // Check if it's a range request
        const isRangeRequest = !!req.headers.range;
        console.log("Range request:", isRangeRequest, req.headers.range);

        const requestHeaders = getRequestHeaders(req);

        let newurl = url; 
        // Stream the response immediately without waiting
        if(referer === "https://rivestream.org/") {
            newurl = newurl + '&headers=%7B%22Referer%22%3A%22https%3A%2F%2Fmoviebox.ng%22%2C%22Origin%22%3A%22https%3A%2F%2Fmoviebox.ng%22%7D'
        }
        const response = await axiosInstance.get(newurl, {
            responseType: 'stream',
            headers: requestHeaders,
            validateStatus: function (status) {
                return status < 400;
            },
            // Disable response buffering for faster streaming
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            // Enable compression but don't decompress automatically for videos
            decompress: false
        });

        // Set streaming headers immediately
        const streamingHeaders = getStreamingHeaders(response.headers);
        
        // Set the status code (important for range requests)
        res.status(response.status);
        res.set(streamingHeaders);

        console.log(`Animetsu: Streaming video from: ${url} (Status: ${response.status}, Range: ${isRangeRequest})`);
        
        // Error handling for stream
        response.data.on('error', (error: any) => {
            console.error('Stream error:', error);
            if (!res.headersSent) {
                res.status(500).send('Stream error');
            }
        });

        // Handle client disconnect
        req.on('close', () => {
            console.log('Client disconnected, destroying stream');
            if (response.data && typeof response.data.destroy === 'function') {
                response.data.destroy();
            }
        });

        // Pipe with high water mark for better buffering
        response.data.pipe(res, { end: true });

    } catch (error: any) {
        console.error("Animetsu proxy error:", {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            code: error.code,
            url: req.query.url
        });

        if (!res.headersSent) {
            res.status(error.response?.status || 500).json({
                error: error.message,
                status: error.response?.status || 'unknown',
                code: error.code
            });
        }
    }
};

function getRequestHeaders(req: Request): any {
    console.log("Animetsu: Preparing request headers");
    console.log("Animetsu: Referer:", req.query.referer || 'https://animetsu.cc/');
    const headers: any = {
        'Accept': 'video/mp4,video/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': '"Google Chrome";v="123", "Chromium";v="123", "Not?A_Brand";v="24"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"macOS"',
        'Sec-Fetch-Dest': 'video',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
        'Referer': req.query.referer || 'https://animetsu.cc/',
        'Origin': req.query.origin || 'https://animetsu.cc',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        // Don't accept encoding to avoid decompression overhead for videos
        'Accept-Encoding': 'identity'
    };

    // Forward Range header if present (crucial for video seeking)
    if (req.headers.range) {
        headers['Range'] = req.headers.range;
    }

    // Forward If-Range header for conditional range requests
    if (req.headers['if-range']) {
        headers['If-Range'] = req.headers['if-range'];
    }

    // Forward If-None-Match for caching
    if (req.headers['if-none-match']) {
        headers['If-None-Match'] = req.headers['if-none-match'];
    }

    return headers;
}

function getStreamingHeaders(responseHeaders: any): any {
    const headers: any = {
        'Content-Type': responseHeaders['content-type'] || 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag, Cache-Control, Last-Modified',
        'X-Content-Type-Options': 'nosniff'
    };

    // Forward essential headers for proper video streaming
    const headersToForward = [
        'content-length',
        'content-range', 
        'etag',
        'last-modified',
        'cache-control'
    ];

    headersToForward.forEach(header => {
        if (responseHeaders[header]) {
            headers[header.split('-').map(word => 
                word.charAt(0).toUpperCase() + word.slice(1)
            ).join('-')] = responseHeaders[header];
        }
    });

    // Set appropriate cache control if not present
    if (!headers['Cache-Control']) {
        headers['Cache-Control'] = 'public, max-age=86400, stale-while-revalidate=3600';
    }

    return headers;
}