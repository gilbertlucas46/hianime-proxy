import axios from "axios";
import { Request, Response } from "express";

export const animetsuM3u8Proxy = async (req: Request, res: Response) => {
    // Set CORS headers immediately
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS, HEAD');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Referer, User-Agent');
    res.header('Access-Control-Expose-Headers', 'Content-Type, Content-Length');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const url = req.query.url as string;
        if (!url) return res.status(400).json("url is required");

        console.log("Animetsu M3U8: Processing URL:", url);

        // Build request headers
        const requestHeaders: any = {
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Ch-Ua': '"Google Chrome";v="123", "Chromium";v="123", "Not?A_Brand";v="24"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"macOS"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site',
            'Referer': 'https://animetsu.cc/',
            'Origin': 'https://animetsu.cc',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
        };

        const response = await axios.get(url, {
            headers: requestHeaders,
            timeout: 30000,
            responseType: 'text'
        });

        let m3u8Content = response.data;
        
        // Helper function to construct full URL based on the input URL
        const constructFullUrl = (inputUrl: string, relativePath: string): string => {
            if (relativePath.startsWith('http')) {
                return relativePath; // Already a full URL
            }
            
            if (inputUrl.includes('stream.animetsu.cc/bato/')) {
                return `https://stream.animetsu.cc/bato/${relativePath}`;
            } else if (inputUrl.includes('tiddies.animetsu.cc/zaza/')) {
                return `https://tiddies.animetsu.cc/zaza/${relativePath}`;
            }
            
            // Fallback: try to extract base URL
            const urlObj = new URL(inputUrl);
            return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/') + 1)}${relativePath}`;
        };
        
        // Check if this is a master playlist (contains #EXT-X-STREAM-INF)
        if (m3u8Content.includes('#EXT-X-STREAM-INF')) {
            console.log("Animetsu M3U8: Processing master playlist");
            
            // Parse and modify master playlist
            const lines = m3u8Content.split('\n');
            const modifiedLines = lines.map((line: string) => {
                // Skip empty lines and comments (except for the ones we want to modify)
                if (line.trim() === '' || line.startsWith('#')) {
                    return line;
                }
                
                // This is a playlist URL - convert to our proxy
                if (line.trim() && !line.startsWith('#')) {
                    const fullUrl = constructFullUrl(url, line.trim());
                    return `/animetsu-proxy-m3u8?url=${encodeURIComponent(fullUrl)}`;
                }
                
                return line;
            });
            
            m3u8Content = modifiedLines.join('\n');
        } 
        // This is a media playlist (contains #EXTINF)
        else if (m3u8Content.includes('#EXTINF')) {
            console.log("Animetsu M3U8: Processing media playlist");
            
            // Parse and modify media playlist
            const lines = m3u8Content.split('\n');
            const modifiedLines = lines.map((line: string) => {
                // Skip empty lines and comments
                if (line.trim() === '' || line.startsWith('#')) {
                    return line;
                }
                
                // This is a segment URL - convert to our proxy
                if (line.trim() && !line.startsWith('#')) {
                    const fullUrl = constructFullUrl(url, line.trim());
                    return `/animetsu-proxy-segment?url=${encodeURIComponent(fullUrl)}`;
                }
                
                return line;
            });
            
            m3u8Content = modifiedLines.join('\n');
        }

        // Set appropriate headers for M3U8
        res.set({
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*'
        });

        console.log(`Animetsu M3U8: Successfully processed playlist from: ${url}`);
        res.send(m3u8Content);

    } catch (error: any) {
        console.error("Animetsu M3U8 proxy error:", {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            url: req.query.url
        });

        res.status(error.response?.status || 500).send(
            `Error: ${error.message}. Status: ${error.response?.status || 'unknown'}`
        );
    }
};

// Proxy for video segments (.ts files)
export const animetsuSegmentProxy = async (req: Request, res: Response) => {
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
        if (!url) return res.status(400).json("url is required");

        console.log("Animetsu Segment: Processing URL:", url);

        // Build request headers - adjust based on the domain
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

        // Set appropriate referer and origin based on the URL
        if (url.includes('stream.animetsu.cc')) {
            requestHeaders['Referer'] = 'https://animetsu.cc/';
            requestHeaders['Origin'] = 'https://animetsu.cc';
        } else if (url.includes('tiddies.animetsu.cc')) {
            requestHeaders['Referer'] = 'https://animetsu.cc/';
            requestHeaders['Origin'] = 'https://animetsu.cc';
        }

        // Forward Range header if present
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

        // Set headers for video segment
        const segmentHeaders: any = {
            'Content-Type': 'video/mp2t', // MPEG-2 Transport Stream
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

        // Set cache control
        segmentHeaders['Cache-Control'] = 'public, max-age=3600';

        // Set the status code and headers
        res.status(response.status);
        res.set(segmentHeaders);

        console.log(`Animetsu Segment: Streaming segment from: ${url} (Status: ${response.status})`);
        
        // Pipe the segment stream directly to response
        response.data.pipe(res);

    } catch (error: any) {
        console.error("Animetsu segment proxy error:", {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            url: req.query.url
        });

        res.status(error.response?.status || 500).send(
            `Error: ${error.message}. Status: ${error.response?.status || 'unknown'}`
        );
    }
};