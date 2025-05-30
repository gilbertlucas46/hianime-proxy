import axios from "axios";
import { Request, Response } from "express";
import { allowedExtensions, LineTransform } from "../utils/cinemaos-transform";

export const cinemaosProxy = async (req: Request, res: Response) => {
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
    if (!url) return res.status(400).json("url is required");

    const isStaticFiles = allowedExtensions.some(ext => url.endsWith(ext));
    const baseUrl = url.replace(/[^/]+$/, "");
    console.log("CinemaOS: Processing URL:", url);

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

    // Extract custom headers from request query parameters or use defaults
    const customReferer = req.query.referer as string || req.headers.referer || "https://cinemaos.live/";
    const customUserAgent = req.query.userAgent as string || req.headers['user-agent'] || 
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
    const customOrigin = req.query.origin as string || req.headers.origin || customReferer;
    console.log("CinemaOS: Using Referer:", customReferer);
    console.log("CinemaOS: Using User-Agent:", customUserAgent);
    console.log("CinemaOS: Using Origin:", customOrigin);

    // Build request headers
    const requestHeaders: any = {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': customReferer,
      'Origin': customOrigin,
      'User-Agent': customUserAgent,
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

    const headers = { ...response.headers };
    
    // Remove problematic headers
    delete headers['content-length'];
    delete headers['content-encoding'];
    delete headers['transfer-encoding'];
    delete headers['connection'];

    // Set appropriate content type
    if (url.endsWith('.m3u8')) {
      headers['Content-Type'] = 'application/vnd.apple.mpegurl';
    } else if (url.endsWith('.ts')) {
      headers['Content-Type'] = 'video/mp2t';
    } else if (url.endsWith('.jpg') || url.endsWith('.jpeg')) {
      headers['Content-Type'] = 'image/jpeg';
    } else if (url.endsWith('.png')) {
      headers['Content-Type'] = 'image/png';
    }

    res.set(headers);

    if (isStaticFiles) {
      console.log(`CinemaOS: Piping static file: ${url.split('/').pop()}`);
      return response.data.pipe(res);
    }

    console.log(`CinemaOS: Transforming m3u8: ${url.split('/').pop()}`);
    const transform = new LineTransform(baseUrl, originalHeadersQuery);
    response.data.pipe(transform).pipe(res);
  } catch (error: any) {
    console.error("CinemaOS proxy error:", {
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