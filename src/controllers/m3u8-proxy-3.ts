import axios from "axios";
import { Request, Response } from "express";
import { allowedExtensions, LineTransform } from "../utils/line-transform-3";

export const m3u8Proxy3 = async (req: Request, res: Response) => {
  try {
    const url = req.query.url as string;
    if (!url) return res.status(400).json("url is required");

    const isStaticFiles = allowedExtensions.some(ext => url.endsWith(ext) || url.includes('mon.key'));
    const baseUrl = url.replace(/[^/]+$/, "");
    console.log("Processing URL:", url);

    const response = await axios.get(url, {
      responseType: 'stream',
      headers: { 
        'Accept': '*/*', 
        'Referer': 'https://kwik.si/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Origin': 'https://kwik.si',
        'sec-ch-ua': '"Chromium";v="123", "Google Chrome";v="123"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    
    const headers = { ...response.headers };
    if (!isStaticFiles) delete headers['content-length'];

    // Add CORS headers
    headers['Access-Control-Allow-Origin'] = '*';
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept';
    
    if (url.endsWith('.m3u8')) {
      headers['Content-Type'] = 'application/vnd.apple.mpegurl';
    } else if (url.includes('mon.key')) {
      headers['Content-Type'] = 'application/octet-stream';
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
    
    // More user-friendly error response
    res.status(error.response?.status || 500).send(
      `Error: ${error.message}. Status: ${error.response?.status || 'unknown'}`
    );
  }
}