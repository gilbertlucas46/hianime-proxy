import axios from "axios";
import { Request, Response } from "express";
import { allowedExtensions, LineTransform } from "../utils/line-transform-2";

export const m3u8Proxy2 = async (req: Request, res: Response) => {
  try {
    const url = req.query.url as string;
    if (!url) return res.status(400).json("url is required");

    const isStaticFiles = allowedExtensions.some(ext => url.endsWith(ext));
    const baseUrl = url.replace(/[^/]+$/, "");
    console.log("baseUrl", url);

    const response = await axios.get(url, {
      responseType: 'stream',
      headers: { Accept: "*/*", Referer: "https://aniwave.at/", 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36' }
    });
    console.log("response", response);
    const headers = { ...response.headers };
    if (!isStaticFiles) delete headers['content-length'];

    // Add CORS headers
    headers['Access-Control-Allow-Origin'] = '*';  // Or set to your specific origin
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept';
    if (url.endsWith('.m3u8')) {
      headers['Content-Type'] = 'application/vnd.apple.mpegurl';
    }

    res.cacheControl = { maxAge: headers['cache-control'] };
    res.set(headers);

    if (isStaticFiles) {
      return response.data.pipe(res);
    }

    const transform = new LineTransform(baseUrl);
    response.data.pipe(transform).pipe(res);
  } catch (error: any) {
    console.log("Error details:", {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      headers: error.response?.headers,
      data: error.response?.data
    });
    res.status(500).send('Internal Server Error');
  }
}
