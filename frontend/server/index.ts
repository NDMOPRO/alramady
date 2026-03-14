import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import chatRouter from "./chatApi";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Parse JSON bodies
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // CORS for development
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-tenant-id, x-user-id');
    if (_req.method === 'OPTIONS') { res.sendStatus(200); return; }
    next();
  });

  // ── Chat API routes (local OpenAI) ──
  app.use("/api/chat", chatRouter);

  // ── Health check ──
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "rasid-frontend", timestamp: new Date().toISOString() });
  });

  // ── API Proxy to backend services via gateway ──
  const GATEWAY_URL = process.env.GATEWAY_URL || process.env.INTERNAL_API_URL || 'http://gateway:80';

  // Proxy all /api/v1/* requests to the gateway
  app.use("/api/v1", async (req, res) => {
    try {
      const targetUrl = `${GATEWAY_URL}/api/v1${req.url}`;
      const headers: Record<string, string> = {
        'Content-Type': req.headers['content-type'] || 'application/json',
      };
      if (req.headers.authorization) headers['Authorization'] = req.headers.authorization as string;
      if (req.headers['x-tenant-id']) headers['x-tenant-id'] = req.headers['x-tenant-id'] as string;
      if (req.headers['x-user-id']) headers['x-user-id'] = req.headers['x-user-id'] as string;

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
      };

      if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const response = await fetch(targetUrl, fetchOptions);
      const contentType = response.headers.get('content-type');

      res.status(response.status);
      if (contentType) res.setHeader('Content-Type', contentType);

      if (contentType?.includes('application/json')) {
        const data = await response.json();
        res.json(data);
      } else {
        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
      }
    } catch (error) {
      console.error('[API Proxy] Error:', error);
      res.status(502).json({ success: false, error: 'الخدمة غير متاحة حالياً' });
    }
  });

  // ── Static files ──
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // ── SPA fallback ──
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    console.log(`Gateway: ${GATEWAY_URL}`);
  });
}

startServer().catch(console.error);
