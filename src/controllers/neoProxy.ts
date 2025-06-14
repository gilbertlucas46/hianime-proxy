import axios from "axios";
import { Request, Response } from "express";
import { allowedExtensions, EncodedLineTransform } from "../utils/neoTransform";

interface DecodedPayload {
    u: string; // URL
    o?: string; // Origin
    r?: string; // Referer
    h?: string; // Hash or additional header
}

export const encodedProxy = async (req: Request, res: Response) => {
    // Set CORS headers immediately
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Referer, User-Agent');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const encodedUrl = req.query.url as string;
        if (!encodedUrl) {
            return res.status(400).json({ error: "url parameter is required" });
        }

        console.log("Encoded Proxy: Processing URL:", encodedUrl);

        // Extract the base64 part (everything before .m3u8)
        const base64Match = encodedUrl.match(/^https?:\/\/[^\/]+\/([^.]+)\.m3u8$/);
        if (!base64Match) {
            return res.status(400).json({ error: "Invalid encoded URL format" });
        }

        const base64Payload = base64Match[1];
        
        // Decode the base64 payload
        let decodedPayload: DecodedPayload;
        try {
            const decodedString = Buffer.from(base64Payload, 'base64').toString('utf-8');
            decodedPayload = JSON.parse(decodedString);
            console.log("Decoded payload:", decodedPayload);
        } catch (decodeError) {
            console.error("Failed to decode payload:", decodeError);
            return res.status(400).json({ error: "Invalid base64 or JSON payload" });
        }

        if (!decodedPayload.u) {
            return res.status(400).json({ error: "No URL found in decoded payload" });
        }

        const targetUrl = decodedPayload.u;
        const baseUrl = targetUrl.replace(/[^/]+$/, "");
        const isStaticFiles = allowedExtensions.some(ext => targetUrl.endsWith(ext));
        
        console.log("Target URL:", targetUrl);
        console.log("Base URL:", baseUrl);

        // Build the original headers query string for passing to subsequent requests
        const buildHeadersQuery = () => {
            const headerParams: string[] = [];

            // Use decoded payload parameters first, then fallback to query params
            const referer = req.query.referer as string || decodedPayload.r;
            const userAgent = req.query.userAgent as string;
            const origin = req.query.origin as string || decodedPayload.o;
            const hash = req.query.hash as string || decodedPayload.h;

            if (referer) {
                headerParams.push(`referer=${encodeURIComponent(referer)}`);
            }
            if (userAgent) {
                headerParams.push(`userAgent=${encodeURIComponent(userAgent)}`);
            }
            if (origin) {
                headerParams.push(`origin=${encodeURIComponent(origin)}`);
            }
            if (hash) {
                headerParams.push(`hash=${encodeURIComponent(hash)}`);
            }

            // Add custom headers
            Object.keys(req.query).forEach(key => {
                if (key.startsWith('header-')) {
                    headerParams.push(`${key}=${encodeURIComponent(req.query[key] as string)}`);
                }
            });

            return headerParams.join('&');
        };

        const originalHeadersQuery = buildHeadersQuery();

        // Get random user agent
        const getRandomUserAgent = () => {
            const userAgents = [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            ];
            return userAgents[Math.floor(Math.random() * userAgents.length)];
        };

        // Extract custom headers from decoded payload or request query parameters
        const customReferer = req.query.referer as string || decodedPayload.r || req.headers.referer || "https://if9.ppzj-youtube.cfd/";
        const customUserAgent = req.query.userAgent as string || req.headers['user-agent'] || getRandomUserAgent();
        const customOrigin = req.query.origin as string || decodedPayload.o || req.headers.origin || customReferer;
        
        console.log("Encoded Proxy: Using Referer:", customReferer);
        console.log("Encoded Proxy: Using User-Agent:", customUserAgent);
        console.log("Encoded Proxy: Using Origin:", customOrigin);

        // Build request headers
        const requestHeaders: any = {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Ch-Ua': '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"macOS"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'cross-site',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'Referer': customReferer,
            'Origin': customOrigin,
            'User-Agent': customUserAgent,
            // Remove X-Forwarded headers that might expose Vercel
            'CF-Ray': undefined,
            'CF-Visitor': undefined,
            'CF-Connecting-IP': undefined,
            'X-Forwarded-For': undefined,
            'X-Forwarded-Proto': undefined,
            'X-Vercel-Id': undefined,
            'X-Real-IP': undefined
        };

        // Add hash as custom header if present
        if (decodedPayload.h) {
            requestHeaders['X-Custom-Hash'] = decodedPayload.h;
        }

        // Add any additional custom headers from query parameters
        Object.keys(req.query).forEach(key => {
            if (key.startsWith('header-')) {
                const headerName = key.replace('header-', '');
                requestHeaders[headerName] = req.query[key] as string;
            }
        });

        const response = await axios.get(targetUrl, {
            responseType: 'stream',
            headers: requestHeaders,
            maxRedirects: 5,
            timeout: 30000
        });

        const headers = { ...response.headers };

        // Remove problematic headers
        delete headers['content-length'];
        delete headers['content-encoding'];
        delete headers['transfer-encoding'];
        delete headers['connection'];

        // Set appropriate content type
        if (targetUrl.endsWith('.m3u8')) {
            headers['Content-Type'] = 'application/vnd.apple.mpegurl';
        } else if (targetUrl.endsWith('.ts')) {
            headers['Content-Type'] = 'video/mp2t';
        } else if (targetUrl.endsWith('.jpg') || targetUrl.endsWith('.jpeg')) {
            headers['Content-Type'] = 'image/jpeg';
        } else if (targetUrl.endsWith('.png')) {
            headers['Content-Type'] = 'image/png';
        } else if (targetUrl.endsWith('.webp')) {
            headers['Content-Type'] = 'image/webp';
        } else if (targetUrl.endsWith('.vtt')) {
            headers['Content-Type'] = 'text/vtt';
        }

        res.set(headers);

        if (isStaticFiles) {
            console.log(`Encoded Proxy: Piping static file: ${targetUrl.split('/').pop()}`);
            return response.data.pipe(res);
        }

        console.log(`Encoded Proxy: Transforming m3u8: ${targetUrl.split('/').pop()}`);
        const transform = new EncodedLineTransform(baseUrl, originalHeadersQuery);
        response.data.pipe(transform).pipe(res);

    } catch (error: any) {
        console.error("Encoded proxy error:", {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            headers: error.response?.headers,
            url: req.query.url
        });

        res.status(error.response?.status || 500).json({
            error: `Proxy error: ${error.message}`,
            status: error.response?.status || 'unknown'
        });
    }
};