import { Request, Response } from "express";
import crypto from "crypto";
import { superTransform } from "./superTransform";

// In-memory storage for URL mappings (in production, use Redis or database)
const urlMappings = new Map<string, string>();

// Generate obfuscated URL with timestamp and signature
export function createObfuscatedUrl(originalUrl: string): string {
    const timestamp = Date.now();
    const randomBytes = crypto.randomBytes(4).toString('hex');
    
    // Create payload with URL and timestamp
    const payload = {
        u: originalUrl,
        t: timestamp
    };
    
    // Encode payload to base64
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64');
    
    // Create signature (simple hash for now)
    const signature = crypto.createHash('md5')
        .update(encodedPayload + process.env.SECRET_KEY || 'default-secret')
        .digest('hex')
        .substring(0, 8);
    
    // Store mapping for validation
    const obfuscatedId = `${encodedPayload}.${signature}`;
    urlMappings.set(obfuscatedId, originalUrl);
    
    // Clean up old mappings (keep only last 1000)
    if (urlMappings.size > 1000) {
        const keys = Array.from(urlMappings.keys());
        for (let i = 0; i < 100; i++) {
            urlMappings.delete(keys[i]);
        }
    }
    
    return obfuscatedId;
}

export const getObfuscatedUrl = async (req: Request, res: Response) => {
    try {
        const { url } = req.query;
        
        if (!url || typeof url !== 'string') {
            return res.status(400).json({ 
                error: "url parameter is required" 
            });
        }

        console.log("Obfuscated URL: Processing URL:", url);
        
        // Generate obfuscated ID
        const obfuscatedId = createObfuscatedUrl(url);
        
        // Create the obfuscated URL
        const baseUrl = process.env.PROXY_BASE_URL || 'http://localhost:4004';
        const obfuscatedUrl = `${baseUrl}/p/${obfuscatedId}`;
        
        console.log("Obfuscated URL: Generated:", obfuscatedUrl);
        
        res.json({
            obfuscatedUrl,
            obfuscatedId,
            originalUrl: url
        });
        
    } catch (error: any) {
        console.error("Obfuscated URL error:", error);
        res.status(500).json({ 
            error: "Failed to generate obfuscated URL" 
        });
    }
};

export const resolveObfuscatedUrl = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        
        if (!id) {
            return res.status(400).json({ 
                error: "ID parameter is required" 
            });
        }

        console.log("Obfuscated URL: Resolving ID:", id);
        
        // Parse the obfuscated ID (format: encodedPayload.signature)
        const [encodedPayload, signature] = id.split('.');
        
        if (!encodedPayload || !signature) {
            return res.status(400).json({ 
                error: "Invalid obfuscated URL format" 
            });
        }
        
        // Verify signature
        const expectedSignature = crypto.createHash('md5')
            .update(encodedPayload + process.env.SECRET_KEY || 'default-secret')
            .digest('hex')
            .substring(0, 8);
            
        if (signature !== expectedSignature) {
            return res.status(403).json({ 
                error: "Invalid signature" 
            });
        }
        
        // Decode payload
        let payload;
        try {
            const decodedPayload = Buffer.from(encodedPayload, 'base64').toString();
            payload = JSON.parse(decodedPayload);
        } catch (error) {
            return res.status(400).json({ 
                error: "Invalid payload" 
            });
        }
        
        // Check if URL is expired (24 hours)
        const now = Date.now();
        const urlAge = now - payload.t;
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        if (urlAge > maxAge) {
            return res.status(410).json({ 
                error: "Obfuscated URL has expired" 
            });
        }
        
        const originalUrl = payload.u;
        console.log("Obfuscated URL: Resolved to:", originalUrl);
        
        // Instead of redirecting, directly call the superTransform function
        // Create a modified request object with the resolved URL
        const modifiedReq = {
            ...req,
            query: { ...req.query, url: originalUrl },
            headers: req.headers || {},
            method: req.method || 'GET'
        } as any;
        
        // Call superTransform directly
        await superTransform(modifiedReq, res);
        
    } catch (error: any) {
        console.error("Obfuscated URL resolve error:", error);
        res.status(500).json({ 
            error: "Failed to resolve obfuscated URL" 
        });
    }
}; 