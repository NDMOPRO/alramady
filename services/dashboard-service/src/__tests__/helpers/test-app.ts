import express, { Express } from 'express';
import { errorHandler, notFoundHandler } from '../../middleware/errorHandler';

export function createTestApp(...routers: Array<{ path: string; router: express.Router }>): Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  for (const { path, router } of routers) {
    app.use(path, router);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
