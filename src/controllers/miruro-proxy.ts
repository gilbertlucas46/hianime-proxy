import axios from "axios";
import { Request, Response } from "express";

const allowedExtensions = ['.ts', '.png', '.jpg', '.webp', '.ico', '.html', '.js', '.css', '.txt', '.key', '.mp4', '.mkv', '.avi', '.m3u8'];

export const miruroProxy = async (req: Request, res: Response) => {
    // Set CORS headers immediately
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Referer, User-Agent');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const url = req.query.url as string;
        const forcePassthrough = req.query.passthrough === 'true';
        
        if (!url) return res.status(400).json("url is required");

        const isStaticFiles = allowedExtensions.some(ext => url.endsWith(ext));
        const baseUrl = url.replace(/[^/]+$/, "");
        console.log("Miruro: Processing URL:", url);

        // Build the original headers query string for passing to subsequent requests
        const buildHeadersQuery = () => {
            const headerParams: string[] = [];

            if (req.query.referer) {
                headerParams.push(`referer=${encodeURIComponent(req.query.referer as string)}`);
            }
            if (req.query.userAgent) {
                headerParams.push(`userAgent=${encodeURIComponent(req.query.userAgent as string)}`);
            }
            if (req.query.origin) {
                headerParams.push(`origin=${encodeURIComponent(req.query.origin as string)}`);
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
        const getRandomUserAgent = () => {
            const userAgents = [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
            ];
            return userAgents[Math.floor(Math.random() * userAgents.length)];
        };

        // Extract custom headers from request query parameters or use defaults
        const customReferer =  "https://douvid.xyz/";
        const customUserAgent =  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
        const customOrigin =  "https://douvid.xyz";
        console.log("Miruro: Using Referer:", customReferer);
        console.log("Miruro: Using User-Agent:", customUserAgent);
        console.log("Miruro: Using Origin:", customOrigin);

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
            'Sec-Fetch-Site': 'same-origin',
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

        // Add any additional custom headers from query parameters
        Object.keys(req.query).forEach(key => {
            if (key.startsWith('header-')) {
                const headerName = key.replace('header-', '');
                requestHeaders[headerName] = req.query[key] as string;
            }
        });

        const response = await axios.get(url, {
            responseType: 'stream',
            headers: requestHeaders,
            maxRedirects: 5,
            timeout: 30000
        });

        console.log(`Miruro:  ${response}`);

        const headers = { ...response.headers };

        // Remove problematic headers
        delete headers['content-length'];
        delete headers['content-encoding'];
        delete headers['transfer-encoding'];
        delete headers['connection'];

        // Set appropriate content type based on URL and response
        if (url.endsWith('.m3u8') || 
            typeof headers['Content-Type'] === 'string' && headers['Content-Type'].includes('application/x-mpegURL') || 
            typeof headers['Content-Type'] === 'string' && headers['Content-Type'].includes('application/vnd.apple.mpegurl') ||
            typeof headers['Content-Type'] === 'string' && headers['Content-Type'].includes('text/plain')) {
            headers['Content-Type'] = 'application/x-mpegURL';
        } else if (url.endsWith('.ts')) {
            headers['Content-Type'] = 'video/mp2t';
        } else if (url.endsWith('.jpg') || url.endsWith('.jpeg')) {
            headers['Content-Type'] = 'image/jpeg';
        } else if (url.endsWith('.png')) {
            headers['Content-Type'] = 'image/png';
        } else if (url.endsWith('.webp')) {
            headers['Content-Type'] = 'image/webp';
        }

        res.set(headers);

        // Helper function to process M3U8 content
        const processM3U8Content = (content: string) => {
            console.log('Miruro: Raw M3U8 content preview:', content.substring(0, 300));
            
            const processedContent = content.split('\n').map(line => {
                const trimmedLine = line.trim();
                
                // Skip empty lines and comments, but keep HLS tags
                if (!trimmedLine || trimmedLine.startsWith('#')) {
                    return line;
                }
                
                let absoluteUrl: string;
                
                if (trimmedLine.startsWith('http')) {
                    // Already absolute URL
                    absoluteUrl = trimmedLine;
                } else {
                    // Relative URL - make it absolute
                    try {
                        absoluteUrl = new URL(trimmedLine, baseUrl).href;
                    } catch (error) {
                        console.warn('Miruro: Failed to resolve URL:', trimmedLine);
                        return line;
                    }
                }
                
                const separator = originalHeadersQuery ? '&' : '';
                const proxiedUrl = `/miruro-proxy?url=${encodeURIComponent(absoluteUrl)}${separator}${originalHeadersQuery}`;
                console.log(`Miruro: Proxifying URL: ${absoluteUrl} -> ${proxiedUrl}`);
                return proxiedUrl;
            }).join('\n');
            
            console.log('Miruro: Processed M3U8 content preview:', processedContent.substring(0, 300));
            return processedContent;
        };

        if(!url.endsWith('.m3u8') ) { 
            // Fetch the image data from the URL and pipe it directly to the response
            // Follow redirects, get the final image data, and send it back with proper CORS headers
            const chunks: Buffer[] = [];
            response.data.on('data', (chunk: Buffer) => chunks.push(chunk));
            response.data.on('end', () => {
                const buffer = Buffer.concat(chunks);
                // Set CORS headers again to ensure they're present
                res.header('Access-Control-Allow-Origin', '*');
                res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
                res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Referer, User-Agent');
                res.set('Content-Type', 'image/png'); // Default to PNG, can be adjusted based on actual content type
                res.send(buffer);
            });
            response.data.on('error', (error: any) => {
                console.error('Miruro stream error:', error);
                res.status(500).send('Stream error');
            });
            return;
        }

        // Handle image files that might contain hidden M3U8 data
        if (
            typeof headers['Content-Type'] === 'string' &&
            headers['Content-Type'].includes('image')
        ) {
            console.log(`Miruro: Processing image file: ${url.split('/').pop()}`);
            
            const chunks: Buffer[] = [];
            response.data.on('data', (chunk: Buffer) => chunks.push(chunk));
            response.data.on('end', () => {
                const imageBuffer = Buffer.concat(chunks);
                const uint8Array = new Uint8Array(imageBuffer);
                
                // Find PNG IEND chunk which marks the end of PNG data
                const iendSignature = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]);
                
                let iendIndex = -1;
                for (let i = 0; i <= uint8Array.length - iendSignature.length; i++) {
                    let found = true;
                    for (let j = 0; j < iendSignature.length; j++) {
                        if (uint8Array[i + j] !== iendSignature[j]) {
                            found = false;
                            break;
                        }
                    }
                    if (found) {
                        iendIndex = i + iendSignature.length;
                        break;
                    }
                }
                
                if (iendIndex !== -1) {
                    // Extract hidden data after PNG IEND
                    const hiddenData = uint8Array.slice(iendIndex);
                    
                    if (hiddenData.length > 0) {
                        const textDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: false });
                        let m3u8Content = textDecoder.decode(hiddenData).replace(/\0/g, '').trim();
                        
                        if (m3u8Content.includes('#EXTM3U') || m3u8Content.includes('#EXT-X-')) {
                            console.log("Miruro: Found hidden M3U8 content in image");
                            console.log('Miruro: Hidden M3U8 content preview:', m3u8Content.substring(0, 300));
                            
                            const processedContent = processM3U8Content(m3u8Content);
                            
                            res.set('Content-Type', 'application/x-mpegURL');
                            return res.send(processedContent);
                        }
                    }
                }
                
                // If no hidden M3U8 found or passthrough requested, return image as-is
                if (forcePassthrough || iendIndex === -1) {
                    return res.send(imageBuffer);
                }
                
                return res.status(422).json({
                    success: false,
                    error: 'No hidden M3U8 content found in image'
                });
            });
            response.data.on('error', (error: any) => {
                console.error('Miruro stream error:', error);
                res.status(500).send('Stream error');
            });
            return;
        }

        // Handle M3U8 files - process URLs to proxy through our server
        if (
            url.endsWith('.m3u8') ||
            (typeof headers['Content-Type'] === 'string' && headers['Content-Type'].includes('application/x-mpegURL')) ||
            (typeof headers['Content-Type'] === 'string' && headers['Content-Type'].includes('application/vnd.apple.mpegurl')) ||
            (typeof headers['Content-Type'] === 'string' && headers['Content-Type'].includes('text/plain'))
        ) {
            console.log(`Miruro: Processing m3u8: ${url.split('/').pop()}`);
            const chunks: Buffer[] = [];
            response.data.on('data', (chunk: Buffer) => chunks.push(chunk));
            response.data.on('end', () => {
                const content = Buffer.concat(chunks).toString('utf8');
                
                // Check if content is actually M3U8
                if (content.includes('#EXTM3U') || content.includes('#EXT-X-')) {
                    const processedContent = processM3U8Content(content);
                    res.send(processedContent);
                } else {
                    // Not M3U8 content, return as-is
                    res.send(content);
                }
            });
            response.data.on('error', (error: any) => {
                console.error('Miruro stream error:', error);
                res.status(500).send('Stream error');
            });
            return;
        }

        if (isStaticFiles) {
            console.log(`Miruro: Piping static file: ${url.split('/').pop()}`);
            return response.data.pipe(res);
        }

        // For other files, pipe directly
        response.data.pipe(res);
    } catch (error: any) {
        console.error("Miruro proxy error:", {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            headers: error.response?.headers,
            url: req.query.url
        });

        res.status(error.response?.status || 500).send(
            `Error: ${error.message}. Status: ${error.response?.status || 'unknown'}`
        );
    }
};