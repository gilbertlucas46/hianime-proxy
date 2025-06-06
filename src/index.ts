import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { router } from './routes/route';
import { cacheRoutes } from "./utils/cache-routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4040;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: "*" }));
app.use(cacheRoutes());

app.get("/", (_, res) => { res.send("hianime streaming m3u8 proxy") });
app.use('/', router);

app.listen(PORT, () => console.log(`http://localhost:${PORT}`));

export default app;