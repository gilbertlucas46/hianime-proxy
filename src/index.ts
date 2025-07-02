import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { router } from './routes/route';
import { cacheRoutes } from "./utils/cache-routes";

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '4004', 10);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: "*" }));
app.use(cacheRoutes());

app.get("/", (_, res) => {
  res.send("hianime streaming m3u8 proxy");
});
app.use('/', router);

// ✅ Bind to 0.0.0.0 instead of localhost
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});

export default app;
