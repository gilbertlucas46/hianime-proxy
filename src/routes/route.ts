import express from 'express';
import { m3u8Proxy } from '../controllers/m3u8-proxy';
import { m3u8Proxy2 } from '../controllers/m3u8-proxy-2';

export const router = express.Router();

router.get('/m3u8-proxy', m3u8Proxy);
router.get('/m3u8-proxy-2/', m3u8Proxy2);