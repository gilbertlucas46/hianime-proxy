import axios from "axios";
import { Request, Response } from "express";

export const subtitleProxy = async (req: Request, res: Response) => {
  // Set CORS headers immediately
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const url = req.query.url as string;
    if (!url) return res.status(400).json("url is required");

    console.log("Proxying subtitle from URL:", url);
    
    // Enhanced request headers for better success rate
    const requestHeaders = {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Referer': 'https://anizone.to/',
      'Origin': 'https://anizone.to',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    };
    
    const response = await axios.get(url, {
      responseType: 'text',  // Use text for subtitle files
      headers: requestHeaders,
      maxRedirects: 5,
      timeout: 10000
    });
    
    // Set appropriate content type based on file extension
    if (url.endsWith('.ass')) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    } else if (url.endsWith('.srt')) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    } else if (url.endsWith('.vtt')) {
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    } else {
      // Default for unknown subtitle formats
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    }
    
    res.send(response.data);
  } catch (error: any) {
    console.error("Subtitle proxy error:", {
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