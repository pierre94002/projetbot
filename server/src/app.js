import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import apiRouter from './api/routes/index.js';
import { notFoundHandler, errorHandler } from './api/middlewares/errorHandler.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json());

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
