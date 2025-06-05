import axios from "axios";
import { Request, Response } from "express";

export const animetsuProxy = async (req: Request, res: Response) => {
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

        console.log("Animetsu: Processing URL:", url);

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
            'Sec-Fetch-Dest': 'video',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site',
            'Referer': 'https://animetsu.cc/',
            'Origin': 'https://animetsu.cc',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
        };

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

        // Force content type to video/mp4
        headers['Content-Type'] = 'video/mp4';
        headers['Accept-Ranges'] = 'bytes';

        res.set(headers);

        console.log(`Animetsu: Streaming MP4 video from: ${url}`);
        
        // Pipe the video stream directly to response
        response.data.pipe(res);

    } catch (error: any) {
        console.error("Animetsu proxy error:", {
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