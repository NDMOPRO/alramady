import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import chatApi from "../chatApi";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // RASID Chat API — local SQLite + direct OpenAI (no Manus resources)
  app.use("/api/chat", chatApi);

  // tRPC API (kept for system/auth compatibility)
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // ── API Proxy to backend services via gateway ──
  const GATEWAY_URL = process.env.GATEWAY_URL || process.env.INTERNAL_API_URL || 'http://gateway:80';

  app.use("/api/v1", async (req, res) => {
    try {
      const targetUrl = `${GATEWAY_URL}/api/v1${req.url}`;
      const headers: Record<string, string> = {};
      if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'] as string;
      if (req.headers.authorization) headers['Authorization'] = req.headers.authorization as string;
      if (req.headers['x-tenant-id']) headers['x-tenant-id'] = req.headers['x-tenant-id'] as string;

      const fetchOptions: RequestInit = { method: req.method, headers };
      if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const response = await fetch(targetUrl, fetchOptions);
      const contentType = response.headers.get('content-type');
      res.status(response.status);
      if (contentType) res.setHeader('Content-Type', contentType);

      if (contentType?.includes('application/json')) {
        res.json(await response.json());
      } else {
        res.send(Buffer.from(await response.arrayBuffer()));
      }
    } catch (error) {
      console.error('[API Proxy]', error);
      res.status(502).json({ success: false, error: 'الخدمة غير متاحة حالياً' });
    }
  });

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "rasid-frontend", gateway: GATEWAY_URL });
  });

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
