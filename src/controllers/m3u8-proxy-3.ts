import axios from "axios";
import { Request, Response } from "express";
import { allowedExtensions, LineTransform } from "../utils/line-transform-3";

export const m3u8Proxy3 = async (req: Request, res: Response) => {
  // Set CORS headers immediately
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const url = req.query.url as string;
    if (!url) return res.status(400).json("url is required");

    console.log("Requested URL:", url);
    
    const isKeyFile = url.includes('mon.key');
    const isStaticFiles = allowedExtensions.some(ext => url.endsWith(ext)) || isKeyFile;
    const baseUrl = url.replace(/[^/]+$/, "");
    
    // Enhanced request headers for better success rate
    const requestHeaders = {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Referer': 'https://kwik.si/',
      'Origin': 'https://kwik.si',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'sec-ch-ua': '"Chromium";v="123", "Google Chrome";v="123"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache'
    };
    
    const response = await axios.get(url, {
      responseType: isKeyFile ? 'arraybuffer' : 'stream',
      headers: requestHeaders,
      maxRedirects: 5
    });
    
    // Special handling for encryption key
    if (isKeyFile) {
      console.log("Serving encryption key file with binary data");
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', response.data.length);
      res.send(Buffer.from(response.data));
      return;
    }
    
    const headers = { ...response.headers };
    
    // Remove problematic headers
    delete headers['content-length']; // Let Express handle content length
    delete headers['content-encoding']; // Prevent double encoding
    delete headers['transfer-encoding'];
    delete headers['connection'];
    
    if (url.endsWith('.m3u8')) {
      headers['Content-Type'] = 'application/vnd.apple.mpegurl';
    } else if (url.endsWith('.jpg')) {
      headers['Content-Type'] = 'image/jpeg';
    }

    res.set(headers);

    if (isStaticFiles) {
      console.log(`Piping static file: ${url.split('/').pop()}`);
      return response.data.pipe(res);
    }

    console.log(`Transforming m3u8: ${url.split('/').pop()}`);
    const transform = new LineTransform(baseUrl);
    response.data.pipe(transform).pipe(res);
  } catch (error: any) {
    console.error("Error details:", {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      headers: error.response?.headers
    });
    
    // Send error response but ensure CORS headers are set
    res.status(error.response?.status || 500).send(
      `Error: ${error.message}. Status: ${error.response?.status || 'unknown'}`
    );
  }
};